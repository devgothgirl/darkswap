//! DarkSwap shielded pool, Solana program.
//!
//! Same notes, tree and proof as the EVM pool (`evm/src/DarkPool.sol`).
//!
//! Accounts this program owns:
//!   pool        PDA ["pool"]             admin, pause flag, the note tree
//!   sol vault   PDA ["sol_vault"]        holds shielded SOL (no data)
//!   asset       PDA ["asset", mint]      limits and books for one asset
//!   nullifier   PDA ["nullifier", n]     exists = note spent (no data)
//! Token vaults are token accounts at PDA ["vault", mint], owned by the
//! SPL Token program, with the pool PDA as their authority.
//!
//! SOL is the asset whose "mint" is the system program id (all zeros).
//!
//! Protocol fee: a share of every shield and every unshield (never of a
//! private send) accrues in the asset account, outside the notes' books, and
//! anyone can sweep it to the fee recipient fixed at initialization. The
//! rate can be changed by the admin, never above MAX_PROTOCOL_FEE_BPS.
//!
//! If the tree ever fills, deposits stop but withdrawals keep working.
//!
//! What the admin can do: list assets, set deposit limits, turn deposits on
//! or off, pause deposits until `guardian_expiry`, hand admin to another key.
//! What the admin can NOT do: move funds, pause withdrawals, change the
//! verifying key. The program's upgrade authority can replace the program;
//! put it behind a multisig with a delay, or remove it, before mainnet.

use darkswap_verifier_parity::merkle::{Tree, TREE_STATE_LEN, ZERO_LEAF};
use darkswap_verifier_parity::{is_field_element, poseidon, verify_transaction, Field, SCALAR_FIELD_MODULUS};
use solana_account_info::{next_account_info, AccountInfo};
use solana_cpi::{invoke, invoke_signed};
use solana_instruction::{AccountMeta, Instruction};
use solana_msg::msg;
use solana_program_entrypoint::{entrypoint, ProgramResult};
use solana_program_error::ProgramError;
use solana_program_log::log_data as sol_log_data;
use solana_pubkey::{pubkey, Pubkey};
use solana_sdk_ids::{bpf_loader_upgradeable, system_program};
use solana_sha256_hasher::hashv;
use solana_system_interface::instruction as system_instruction;
use solana_sysvar::{clock::Clock, rent::Rent, Sysvar};

entrypoint!(process_instruction);

pub const SPL_TOKEN_ID: Pubkey = pubkey!("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
/// The "mint" that stands for native SOL.
pub const SOL_MINT: Pubkey = system_program::ID;

// ---- account layouts ---------------------------------------------------------

const POOL_DISC: &[u8; 8] = b"DSPOOL01";
const P_ADMIN: usize = 8;
const P_GUARDIAN_EXPIRY: usize = 40;
const P_PAUSED: usize = 48;
const P_BUMP: usize = 49;
const P_SOL_VAULT_BUMP: usize = 50;
const P_FEE_BPS: usize = 52; // u16
const P_FEE_RECIPIENT: usize = 56; // 32 bytes, fixed at initialization
const P_TREE: usize = 88;
pub const POOL_LEN: usize = P_TREE + TREE_STATE_LEN;

const ASSET_DISC: &[u8; 8] = b"DSASSET1";
const A_MINT: usize = 8;
const A_ASSET_ID: usize = 40;
const A_ENABLED: usize = 72;
const A_DECIMALS: usize = 73;
const A_BUMP: usize = 74;
const A_VAULT_BUMP: usize = 75;
const A_MAX_DEPOSIT: usize = 80;
const A_CAP: usize = 88;
const A_BALANCE: usize = 96;
const A_MIN_DEPOSIT: usize = 104;
/// Protocol fees accrued and not yet swept. Not part of A_BALANCE.
const A_FEES: usize = 112;
pub const ASSET_LEN: usize = 120;

/// Hard ceiling on the protocol fee: 1%.
pub const MAX_PROTOCOL_FEE_BPS: u16 = 100;

const TOKEN_ACCOUNT_LEN: usize = 165;
const MAX_ENCRYPTED_OUTPUT: usize = 256;

// ---- errors --------------------------------------------------------------------

#[repr(u32)]
#[derive(Clone, Copy, Debug)]
pub enum PoolError {
    NotAdmin = 1,
    WrongAccount = 2,
    DepositsAreOff = 3,
    AmountOutOfRange = 4,
    OverDepositLimit = 5,
    OverDepositCap = 6,
    InsufficientPoolBalance = 7,
    UnknownRoot = 8,
    NullifierAlreadySpent = 9,
    DuplicateNullifier = 10,
    InputOutOfField = 11,
    InvalidProof = 12,
    BadExtData = 13,
    PauseWindowOver = 14,
    TreeFull = 15,
    NotUpgradeAuthority = 16,
    BadTransferAmount = 17,
    UnderDepositMinimum = 18,
    FeeTooHigh = 19,
    NothingToCollect = 20,
}

impl From<PoolError> for ProgramError {
    fn from(e: PoolError) -> Self {
        ProgramError::Custom(e as u32)
    }
}

fn fail(e: PoolError) -> ProgramResult {
    msg!("error: {:?}", e);
    Err(e.into())
}

macro_rules! require {
    ($cond:expr, $err:expr) => {
        if !($cond) {
            return fail($err);
        }
    };
}

// ---- instruction data reader ---------------------------------------------------

struct Reader<'a> {
    data: &'a [u8],
    at: usize,
}

impl<'a> Reader<'a> {
    fn take(&mut self, n: usize) -> Result<&'a [u8], ProgramError> {
        let end = self.at.checked_add(n).ok_or(ProgramError::InvalidInstructionData)?;
        let out = self.data.get(self.at..end).ok_or(ProgramError::InvalidInstructionData)?;
        self.at = end;
        Ok(out)
    }
    fn u8(&mut self) -> Result<u8, ProgramError> {
        Ok(self.take(1)?[0])
    }
    fn u16(&mut self) -> Result<u16, ProgramError> {
        Ok(u16::from_le_bytes(self.take(2)?.try_into().unwrap()))
    }
    fn u64(&mut self) -> Result<u64, ProgramError> {
        Ok(u64::from_le_bytes(self.take(8)?.try_into().unwrap()))
    }
    fn i64(&mut self) -> Result<i64, ProgramError> {
        Ok(i64::from_le_bytes(self.take(8)?.try_into().unwrap()))
    }
    fn arr<const N: usize>(&mut self) -> Result<[u8; N], ProgramError> {
        Ok(self.take(N)?.try_into().unwrap())
    }
    fn bytes(&mut self) -> Result<&'a [u8], ProgramError> {
        let n = self.u16()? as usize;
        if n > MAX_ENCRYPTED_OUTPUT {
            return Err(ProgramError::InvalidInstructionData);
        }
        self.take(n)
    }
    fn done(&self) -> ProgramResult {
        if self.at == self.data.len() {
            Ok(())
        } else {
            Err(ProgramError::InvalidInstructionData)
        }
    }
}

// ---- small helpers -------------------------------------------------------------

fn u64_at(d: &[u8], at: usize) -> u64 {
    u64::from_le_bytes(d[at..at + 8].try_into().unwrap())
}
fn set_u64(d: &mut [u8], at: usize, v: u64) {
    d[at..at + 8].copy_from_slice(&v.to_le_bytes());
}
fn key_at(d: &[u8], at: usize) -> Pubkey {
    Pubkey::new_from_array(d[at..at + 32].try_into().unwrap())
}

/// A u64 as a 32-byte big-endian field element.
fn field_from_u64(v: u64) -> Field {
    let mut out = [0u8; 32];
    out[24..].copy_from_slice(&v.to_be_bytes());
    out
}

/// p - v for 0 < v < 2^128, big-endian.
fn field_neg(v: u128) -> Field {
    let mut out = SCALAR_FIELD_MODULUS;
    let mut borrow: u16 = 0;
    let vb = v.to_be_bytes();
    for i in (0..32).rev() {
        let sub = if i >= 16 { vb[i - 16] as u16 } else { 0 } + borrow;
        let cur = out[i] as u16;
        if cur >= sub {
            out[i] = (cur - sub) as u8;
            borrow = 0;
        } else {
            out[i] = (cur + 256 - sub) as u8;
            borrow = 1;
        }
    }
    out
}

/// Asset id of a mint: Poseidon(high 16 bytes, low 16 bytes).
pub fn asset_id_of(mint: &Pubkey) -> Field {
    let b = mint.to_bytes();
    let mut hi = [0u8; 32];
    let mut lo = [0u8; 32];
    hi[16..].copy_from_slice(&b[..16]);
    lo[16..].copy_from_slice(&b[16..]);
    poseidon(&[&hi, &lo]).expect("16-byte halves are in the field")
}

/// sha256 over everything the proof binds besides the notes, cut to 253
/// bits so it is always a field element.
#[allow(clippy::too_many_arguments)]
pub fn ext_data_hash(
    program_id: &Pubkey,
    recipient: &Pubkey,
    relayer: &Pubkey,
    mint: &Pubkey,
    ext_amount: i64,
    fee: u64,
    enc1: &[u8],
    enc2: &[u8],
) -> Field {
    let mut h = hashv(&[
        b"darkswap.solana.extdata.v1",
        program_id.as_ref(),
        recipient.as_ref(),
        relayer.as_ref(),
        mint.as_ref(),
        &ext_amount.to_le_bytes(),
        &fee.to_le_bytes(),
        &(enc1.len() as u16).to_le_bytes(),
        enc1,
        &(enc2.len() as u16).to_le_bytes(),
        enc2,
    ])
    .to_bytes();
    h[0] &= 0x1f;
    h
}

/// Creates a PDA account even if someone already sent lamports to its
/// address (which would make a plain create_account fail). Without this,
/// anyone who saw a nullifier could block that note forever.
fn create_pda<'a>(
    payer: &AccountInfo<'a>,
    target: &AccountInfo<'a>,
    system: &AccountInfo<'a>,
    owner: &Pubkey,
    space: usize,
    seeds: &[&[u8]],
) -> ProgramResult {
    let rent = Rent::get()?.minimum_balance(space);
    if target.lamports() == 0 {
        return invoke_signed(
            &system_instruction::create_account(payer.key, target.key, rent, space as u64, owner),
            &[payer.clone(), target.clone(), system.clone()],
            &[seeds],
        );
    }
    if target.owner != &system_program::ID || !target.data_is_empty() {
        return Err(ProgramError::AccountAlreadyInitialized);
    }
    let top_up = rent.saturating_sub(target.lamports());
    if top_up > 0 {
        invoke(
            &system_instruction::transfer(payer.key, target.key, top_up),
            &[payer.clone(), target.clone(), system.clone()],
        )?;
    }
    if space > 0 {
        invoke_signed(&system_instruction::allocate(target.key, space as u64), &[target.clone(), system.clone()], &[seeds])?;
    }
    invoke_signed(&system_instruction::assign(target.key, owner), &[target.clone(), system.clone()], &[seeds])
}

fn token_amount(account: &AccountInfo) -> Result<u64, ProgramError> {
    let d = account.try_borrow_data()?;
    if d.len() != TOKEN_ACCOUNT_LEN {
        return Err(ProgramError::InvalidAccountData);
    }
    Ok(u64_at(&d, 64))
}

#[allow(clippy::too_many_arguments)]
fn token_transfer<'a>(
    token_program: &AccountInfo<'a>,
    from: &AccountInfo<'a>,
    mint: &AccountInfo<'a>,
    to: &AccountInfo<'a>,
    authority: &AccountInfo<'a>,
    amount: u64,
    decimals: u8,
    signer_seeds: Option<&[&[u8]]>,
) -> ProgramResult {
    let mut data = Vec::with_capacity(10);
    data.push(12u8); // TransferChecked
    data.extend_from_slice(&amount.to_le_bytes());
    data.push(decimals);
    let ix = Instruction {
        program_id: SPL_TOKEN_ID,
        accounts: vec![
            AccountMeta::new(*from.key, false),
            AccountMeta::new_readonly(*mint.key, false),
            AccountMeta::new(*to.key, false),
            AccountMeta::new_readonly(*authority.key, true),
        ],
        data,
    };
    let infos = [from.clone(), mint.clone(), to.clone(), authority.clone(), token_program.clone()];
    match signer_seeds {
        Some(seeds) => invoke_signed(&ix, &infos, &[seeds]),
        None => invoke(&ix, &infos),
    }
}

// ---- account checks ------------------------------------------------------------

fn check_pool(program_id: &Pubkey, pool: &AccountInfo) -> Result<u8, ProgramError> {
    if pool.owner != program_id {
        return Err(PoolError::WrongAccount.into());
    }
    let d = pool.try_borrow_data()?;
    if d.len() != POOL_LEN || &d[..8] != POOL_DISC {
        return Err(PoolError::WrongAccount.into());
    }
    let bump = d[P_BUMP];
    let expected = Pubkey::create_program_address(&[b"pool", &[bump]], program_id)
        .map_err(|_| ProgramError::from(PoolError::WrongAccount))?;
    if expected != *pool.key {
        return Err(PoolError::WrongAccount.into());
    }
    Ok(bump)
}

fn check_admin(pool: &AccountInfo, admin: &AccountInfo) -> ProgramResult {
    require!(admin.is_signer, PoolError::NotAdmin);
    let d = pool.try_borrow_data()?;
    require!(key_at(&d, P_ADMIN) == *admin.key, PoolError::NotAdmin);
    Ok(())
}

/// Checks the asset account and returns its mint.
fn check_asset(program_id: &Pubkey, asset: &AccountInfo) -> Result<Pubkey, ProgramError> {
    if asset.owner != program_id {
        return Err(PoolError::WrongAccount.into());
    }
    let d = asset.try_borrow_data()?;
    if d.len() != ASSET_LEN || &d[..8] != ASSET_DISC {
        return Err(PoolError::WrongAccount.into());
    }
    let mint = key_at(&d, A_MINT);
    let expected = Pubkey::create_program_address(&[b"asset", mint.as_ref(), &[d[A_BUMP]]], program_id)
        .map_err(|_| ProgramError::from(PoolError::WrongAccount))?;
    if expected != *asset.key {
        return Err(PoolError::WrongAccount.into());
    }
    Ok(mint)
}

fn check_vault(program_id: &Pubkey, pool: &AccountInfo, asset: &AccountInfo, vault: &AccountInfo) -> ProgramResult {
    let a = asset.try_borrow_data()?;
    let mint = key_at(&a, A_MINT);
    let expected = if mint == SOL_MINT {
        let p = pool.try_borrow_data()?;
        Pubkey::create_program_address(&[b"sol_vault", &[p[P_SOL_VAULT_BUMP]]], program_id)
    } else {
        Pubkey::create_program_address(&[b"vault", mint.as_ref(), &[a[A_VAULT_BUMP]]], program_id)
    }
    .map_err(|_| ProgramError::from(PoolError::WrongAccount))?;
    require!(expected == *vault.key, PoolError::WrongAccount);
    let owner_ok = if mint == SOL_MINT { vault.owner == program_id } else { vault.owner == &SPL_TOKEN_ID };
    require!(owner_ok, PoolError::WrongAccount);
    Ok(())
}

// ---- entrypoint ----------------------------------------------------------------

pub fn process_instruction(program_id: &Pubkey, accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    let (tag, rest) = data.split_first().ok_or(ProgramError::InvalidInstructionData)?;
    let mut r = Reader { data: rest, at: 0 };
    match tag {
        0 => initialize(program_id, accounts, &mut r),
        1 => list_asset(program_id, accounts, &mut r),
        2 => update_asset(program_id, accounts, &mut r),
        3 => set_paused(program_id, accounts, &mut r),
        4 => set_admin(program_id, accounts, &mut r),
        5 => shield(program_id, accounts, &mut r),
        6 => transact(program_id, accounts, &mut r),
        7 => set_fee(program_id, accounts, &mut r),
        8 => collect_fees(program_id, accounts, &mut r),
        _ => Err(ProgramError::InvalidInstructionData),
    }
}

/// accounts: admin (signer, writable), pool, sol_vault, program_data, system_program
/// data: guardian_expiry i64, fee_recipient [32], fee_bps u16
fn initialize(program_id: &Pubkey, accounts: &[AccountInfo], r: &mut Reader) -> ProgramResult {
    let it = &mut accounts.iter();
    let admin = next_account_info(it)?;
    let pool = next_account_info(it)?;
    let sol_vault = next_account_info(it)?;
    let program_data = next_account_info(it)?;
    let system = next_account_info(it)?;
    let guardian_expiry = r.i64()?;
    let fee_recipient: [u8; 32] = r.arr()?;
    let fee_bps = r.u16()?;
    r.done()?;
    require!(admin.is_signer, PoolError::NotAdmin);
    require!(fee_bps <= MAX_PROTOCOL_FEE_BPS, PoolError::FeeTooHigh);
    require!(fee_recipient != [0u8; 32], PoolError::BadExtData);
    require!(*system.key == system_program::ID, PoolError::WrongAccount);

    // Only the program's upgrade authority may initialize, so nobody can
    // front-run the deployment and make themselves admin.
    let (pd_key, _) = Pubkey::find_program_address(&[program_id.as_ref()], &bpf_loader_upgradeable::id());
    require!(*program_data.key == pd_key && program_data.owner == &bpf_loader_upgradeable::id(), PoolError::WrongAccount);
    {
        let pd = program_data.try_borrow_data()?;
        require!(pd.len() >= 45 && pd[0..4] == 3u32.to_le_bytes() && pd[12] == 1, PoolError::NotUpgradeAuthority);
        require!(key_at(&pd, 13) == *admin.key, PoolError::NotUpgradeAuthority);
    }

    let (pool_key, pool_bump) = Pubkey::find_program_address(&[b"pool"], program_id);
    let (vault_key, vault_bump) = Pubkey::find_program_address(&[b"sol_vault"], program_id);
    require!(*pool.key == pool_key && *sol_vault.key == vault_key, PoolError::WrongAccount);

    create_pda(admin, pool, system, program_id, POOL_LEN, &[b"pool", &[pool_bump]])?;
    create_pda(admin, sol_vault, system, program_id, 0, &[b"sol_vault", &[vault_bump]])?;

    let mut d = pool.try_borrow_mut_data()?;
    d[..8].copy_from_slice(POOL_DISC);
    d[P_ADMIN..P_ADMIN + 32].copy_from_slice(admin.key.as_ref());
    d[P_GUARDIAN_EXPIRY..P_GUARDIAN_EXPIRY + 8].copy_from_slice(&guardian_expiry.to_le_bytes());
    d[P_PAUSED] = 0;
    d[P_BUMP] = pool_bump;
    d[P_SOL_VAULT_BUMP] = vault_bump;
    d[P_FEE_BPS..P_FEE_BPS + 2].copy_from_slice(&fee_bps.to_le_bytes());
    d[P_FEE_RECIPIENT..P_FEE_RECIPIENT + 32].copy_from_slice(&fee_recipient);
    let mut tree = Tree::new(&mut d[P_TREE..]).map_err(|_| ProgramError::InvalidAccountData)?;
    tree.initialize();
    msg!("pool initialized");
    Ok(())
}

/// accounts: admin (signer, writable), pool, asset, mint, vault, token_program, system_program
///   SOL: mint = system program, vault = sol_vault, token_program = system program
/// data: min_deposit u64, max_deposit u64, deposit_cap u64
fn list_asset(program_id: &Pubkey, accounts: &[AccountInfo], r: &mut Reader) -> ProgramResult {
    let it = &mut accounts.iter();
    let admin = next_account_info(it)?;
    let pool = next_account_info(it)?;
    let asset = next_account_info(it)?;
    let mint = next_account_info(it)?;
    let vault = next_account_info(it)?;
    let token_program = next_account_info(it)?;
    let system = next_account_info(it)?;
    let min_deposit = r.u64()?;
    let max_deposit = r.u64()?;
    let cap = r.u64()?;
    r.done()?;
    let pool_bump = check_pool(program_id, pool)?;
    check_admin(pool, admin)?;
    require!(*system.key == system_program::ID, PoolError::WrongAccount);

    let (asset_key, asset_bump) = Pubkey::find_program_address(&[b"asset", mint.key.as_ref()], program_id);
    require!(*asset.key == asset_key, PoolError::WrongAccount);

    let (decimals, vault_bump) = if *mint.key == SOL_MINT {
        let p = pool.try_borrow_data()?;
        let expected = Pubkey::create_program_address(&[b"sol_vault", &[p[P_SOL_VAULT_BUMP]]], program_id)
            .map_err(|_| ProgramError::from(PoolError::WrongAccount))?;
        require!(*vault.key == expected, PoolError::WrongAccount);
        (9u8, 0u8)
    } else {
        require!(*token_program.key == SPL_TOKEN_ID && mint.owner == &SPL_TOKEN_ID, PoolError::WrongAccount);
        let decimals = {
            let m = mint.try_borrow_data()?;
            require!(m.len() == 82 && m[45] == 1, PoolError::WrongAccount); // initialized mint
            m[44]
        };
        let (vault_key, vault_bump) = Pubkey::find_program_address(&[b"vault", mint.key.as_ref()], program_id);
        require!(*vault.key == vault_key, PoolError::WrongAccount);
        create_pda(admin, vault, system, &SPL_TOKEN_ID, TOKEN_ACCOUNT_LEN, &[b"vault", mint.key.as_ref(), &[vault_bump]])?;
        let pool_key = Pubkey::create_program_address(&[b"pool", &[pool_bump]], program_id)
            .map_err(|_| ProgramError::from(PoolError::WrongAccount))?;
        let mut data = vec![18u8]; // InitializeAccount3
        data.extend_from_slice(pool_key.as_ref());
        invoke(
            &Instruction {
                program_id: SPL_TOKEN_ID,
                accounts: vec![AccountMeta::new(*vault.key, false), AccountMeta::new_readonly(*mint.key, false)],
                data,
            },
            &[vault.clone(), mint.clone(), token_program.clone()],
        )?;
        (decimals, vault_bump)
    };

    create_pda(admin, asset, system, program_id, ASSET_LEN, &[b"asset", mint.key.as_ref(), &[asset_bump]])?;
    let mut d = asset.try_borrow_mut_data()?;
    d[..8].copy_from_slice(ASSET_DISC);
    d[A_MINT..A_MINT + 32].copy_from_slice(mint.key.as_ref());
    d[A_ASSET_ID..A_ASSET_ID + 32].copy_from_slice(&asset_id_of(mint.key));
    d[A_ENABLED] = 1;
    d[A_DECIMALS] = decimals;
    d[A_BUMP] = asset_bump;
    d[A_VAULT_BUMP] = vault_bump;
    set_u64(&mut d, A_MIN_DEPOSIT, min_deposit);
    set_u64(&mut d, A_MAX_DEPOSIT, max_deposit);
    set_u64(&mut d, A_CAP, cap);
    set_u64(&mut d, A_BALANCE, 0);
    set_u64(&mut d, A_FEES, 0);
    sol_log_data(&[b"asset", mint.key.as_ref(), &asset_id_of(mint.key)]);
    Ok(())
}

/// accounts: admin (signer), pool, asset.  data: enabled u8, min_deposit u64, max_deposit u64, deposit_cap u64
fn update_asset(program_id: &Pubkey, accounts: &[AccountInfo], r: &mut Reader) -> ProgramResult {
    let it = &mut accounts.iter();
    let admin = next_account_info(it)?;
    let pool = next_account_info(it)?;
    let asset = next_account_info(it)?;
    let enabled = r.u8()?;
    let min_deposit = r.u64()?;
    let max_deposit = r.u64()?;
    let cap = r.u64()?;
    r.done()?;
    check_pool(program_id, pool)?;
    check_admin(pool, admin)?;
    check_asset(program_id, asset)?;
    let mut d = asset.try_borrow_mut_data()?;
    d[A_ENABLED] = (enabled != 0) as u8;
    set_u64(&mut d, A_MIN_DEPOSIT, min_deposit);
    set_u64(&mut d, A_MAX_DEPOSIT, max_deposit);
    set_u64(&mut d, A_CAP, cap);
    Ok(())
}

/// accounts: admin (signer), pool.  data: paused u8
/// Pausing works only before guardian_expiry. Withdrawals are never paused.
fn set_paused(program_id: &Pubkey, accounts: &[AccountInfo], r: &mut Reader) -> ProgramResult {
    let it = &mut accounts.iter();
    let admin = next_account_info(it)?;
    let pool = next_account_info(it)?;
    let paused = r.u8()? != 0;
    r.done()?;
    check_pool(program_id, pool)?;
    check_admin(pool, admin)?;
    let mut d = pool.try_borrow_mut_data()?;
    if paused {
        let expiry = i64::from_le_bytes(d[P_GUARDIAN_EXPIRY..P_GUARDIAN_EXPIRY + 8].try_into().unwrap());
        require!(Clock::get()?.unix_timestamp < expiry, PoolError::PauseWindowOver);
    }
    d[P_PAUSED] = paused as u8;
    Ok(())
}

/// accounts: admin (signer), pool.  data: new_admin [32]
fn set_admin(program_id: &Pubkey, accounts: &[AccountInfo], r: &mut Reader) -> ProgramResult {
    let it = &mut accounts.iter();
    let admin = next_account_info(it)?;
    let pool = next_account_info(it)?;
    let new_admin: [u8; 32] = r.arr()?;
    r.done()?;
    check_pool(program_id, pool)?;
    check_admin(pool, admin)?;
    pool.try_borrow_mut_data()?[P_ADMIN..P_ADMIN + 32].copy_from_slice(&new_admin);
    Ok(())
}

/// Public deposit, no proof. The note is worth `amount`; the depositor pays
/// `amount` plus the protocol fee.
/// accounts: depositor (signer, writable), pool, asset, vault, system_program
///           + for tokens: depositor_token_account, mint, token_program
/// data: amount u64, public_key [32], blinding [32], encrypted_output (u16 len + bytes)
fn shield(program_id: &Pubkey, accounts: &[AccountInfo], r: &mut Reader) -> ProgramResult {
    let it = &mut accounts.iter();
    let depositor = next_account_info(it)?;
    let pool = next_account_info(it)?;
    let asset = next_account_info(it)?;
    let vault = next_account_info(it)?;
    let system = next_account_info(it)?;
    let amount = r.u64()?;
    let public_key: Field = r.arr()?;
    let blinding: Field = r.arr()?;
    let encrypted_output = r.bytes()?;
    r.done()?;

    require!(depositor.is_signer, PoolError::WrongAccount);
    require!(*system.key == system_program::ID, PoolError::WrongAccount);
    check_pool(program_id, pool)?;
    let mint = check_asset(program_id, asset)?;
    check_vault(program_id, pool, asset, vault)?;
    require!(is_field_element(&public_key) && is_field_element(&blinding), PoolError::InputOutOfField);
    require!(pool.try_borrow_data()?[P_PAUSED] == 0, PoolError::DepositsAreOff);
    let (asset_id, decimals) = {
        let a = asset.try_borrow_data()?;
        require!(a[A_ENABLED] == 1, PoolError::DepositsAreOff);
        let mut id = [0u8; 32];
        id.copy_from_slice(&a[A_ASSET_ID..A_ASSET_ID + 32]);
        (id, a[A_DECIMALS])
    };
    require!(amount > 0, PoolError::AmountOutOfRange);
    let fee = protocol_fee(pool, amount)?;
    let charged = amount.checked_add(fee).ok_or(ProgramError::from(PoolError::AmountOutOfRange))?;

    let received = if mint == SOL_MINT {
        invoke(
            &system_instruction::transfer(depositor.key, vault.key, charged),
            &[depositor.clone(), vault.clone(), system.clone()],
        )?;
        charged
    } else {
        let from = next_account_info(it)?;
        let mint_info = next_account_info(it)?;
        let token_program = next_account_info(it)?;
        require!(*token_program.key == SPL_TOKEN_ID && *mint_info.key == mint, PoolError::WrongAccount);
        let before = token_amount(vault)?;
        token_transfer(token_program, from, mint_info, vault, depositor, charged, decimals, None)?;
        let after = token_amount(vault)?;
        after.checked_sub(before).ok_or(ProgramError::from(PoolError::BadTransferAmount))?
    };
    // The note must be for exactly what the depositor's wallet encrypted.
    require!(received == charged, PoolError::BadTransferAmount);
    credit(asset, amount)?;
    charge_fee(asset, 0, fee)?;

    let commitment = poseidon(&[&field_from_u64(amount), &asset_id, &public_key, &blinding])
        .ok_or(ProgramError::from(PoolError::InputOutOfField))?;
    let index = {
        let mut d = pool.try_borrow_mut_data()?;
        let mut tree = Tree::new(&mut d[P_TREE..]).map_err(|_| ProgramError::InvalidAccountData)?;
        tree.insert_pair(&commitment, &ZERO_LEAF).map_err(|_| ProgramError::from(PoolError::TreeFull))?
    };
    sol_log_data(&[b"commitment", &commitment, &index.to_le_bytes(), encrypted_output]);
    sol_log_data(&[b"shield", mint.as_ref(), &amount.to_le_bytes(), &public_key, &blinding, &index.to_le_bytes()]);
    Ok(())
}

fn credit(asset: &AccountInfo, amount: u64) -> ProgramResult {
    let mut a = asset.try_borrow_mut_data()?;
    require!(amount >= u64_at(&a, A_MIN_DEPOSIT), PoolError::UnderDepositMinimum);
    require!(amount <= u64_at(&a, A_MAX_DEPOSIT), PoolError::OverDepositLimit);
    let next = u64_at(&a, A_BALANCE).checked_add(amount).ok_or(ProgramError::from(PoolError::OverDepositCap))?;
    require!(next <= u64_at(&a, A_CAP), PoolError::OverDepositCap);
    set_u64(&mut a, A_BALANCE, next);
    Ok(())
}

/// Spend notes with a proof: private send, unshield, or both with a relayer fee.
/// accounts: payer (signer, writable), pool, nullifier0, nullifier1, system_program
///   when value leaves (ext_amount < 0 or fee > 0), also:
///   asset, vault, recipient, relayer, and for tokens: mint, token_program
///   (recipient and relayer are token accounts for tokens, wallets for SOL)
/// data: proof_a [64], proof_b [128], proof_c [64], root [32], nullifier0 [32],
///   nullifier1 [32], commitment0 [32], commitment1 [32], ext_amount i64, fee u64,
///   encrypted_output0 (u16 len + bytes), encrypted_output1 (u16 len + bytes)
fn transact(program_id: &Pubkey, accounts: &[AccountInfo], r: &mut Reader) -> ProgramResult {
    let it = &mut accounts.iter();
    let payer = next_account_info(it)?;
    let pool = next_account_info(it)?;
    let null0 = next_account_info(it)?;
    let null1 = next_account_info(it)?;
    let system = next_account_info(it)?;

    let proof_a: [u8; 64] = r.arr()?;
    let proof_b: [u8; 128] = r.arr()?;
    let proof_c: [u8; 64] = r.arr()?;
    let root: Field = r.arr()?;
    let n0: Field = r.arr()?;
    let n1: Field = r.arr()?;
    let c0: Field = r.arr()?;
    let c1: Field = r.arr()?;
    let ext_amount = r.i64()?;
    let fee = r.u64()?;
    let enc0 = r.bytes()?;
    let enc1 = r.bytes()?;
    r.done()?;

    require!(payer.is_signer, PoolError::WrongAccount);
    require!(*system.key == system_program::ID, PoolError::WrongAccount);
    let pool_bump = check_pool(program_id, pool)?;
    // Deposits go through `shield`; this path only moves value out.
    require!(ext_amount <= 0 && ext_amount > i64::MIN, PoolError::AmountOutOfRange);
    require!(is_field_element(&n0) && is_field_element(&n1), PoolError::InputOutOfField);
    require!(is_field_element(&c0) && is_field_element(&c1), PoolError::InputOutOfField);
    require!(n0 != n1, PoolError::DuplicateNullifier);
    {
        let mut d = pool.try_borrow_mut_data()?;
        let tree = Tree::new(&mut d[P_TREE..]).map_err(|_| ProgramError::InvalidAccountData)?;
        require!(tree.is_known_root(&root), PoolError::UnknownRoot);
    }

    let moves_value = ext_amount != 0 || fee != 0;
    let zero_key = Pubkey::default();
    let (public_amount, public_asset_id, value_accounts) = if moves_value {
        let asset = next_account_info(it)?;
        let vault = next_account_info(it)?;
        let recipient = next_account_info(it)?;
        let relayer = next_account_info(it)?;
        let mint = check_asset(program_id, asset)?;
        check_vault(program_id, pool, asset, vault)?;
        let out = (ext_amount.unsigned_abs() as u128) + fee as u128; // < 2^65
        let mut asset_id = [0u8; 32];
        asset_id.copy_from_slice(&asset.try_borrow_data()?[A_ASSET_ID..A_ASSET_ID + 32]);
        (field_neg(out), asset_id, Some((asset, vault, recipient, relayer, mint)))
    } else {
        ([0u8; 32], [0u8; 32], None)
    };

    let (recipient_key, relayer_key, mint_key) = match &value_accounts {
        Some((_, _, recipient, relayer, mint)) => (*recipient.key, *relayer.key, *mint),
        None => (zero_key, zero_key, zero_key),
    };
    let ext_hash = ext_data_hash(program_id, &recipient_key, &relayer_key, &mint_key, ext_amount, fee, enc0, enc1);

    let public_inputs = [root, public_amount, ext_hash, public_asset_id, n0, n1, c0, c1];
    if verify_transaction(&proof_a, &proof_b, &proof_c, &public_inputs).is_err() {
        return fail(PoolError::InvalidProof);
    }

    // Spend: one account per nullifier. If it already belongs to this
    // program, the note was spent before.
    for (account, n) in [(null0, &n0), (null1, &n1)] {
        let (expected, bump) = Pubkey::find_program_address(&[b"nullifier", n], program_id);
        require!(*account.key == expected, PoolError::WrongAccount);
        require!(account.owner != program_id, PoolError::NullifierAlreadySpent);
        create_pda(payer, account, system, program_id, 0, &[b"nullifier", n, &[bump]])?;
        sol_log_data(&[b"nullifier", n]);
    }

    {
        let mut d = pool.try_borrow_mut_data()?;
        let mut tree = Tree::new(&mut d[P_TREE..]).map_err(|_| ProgramError::InvalidAccountData)?;
        if tree.is_full() {
            // A full tree must never block withdrawals. The outputs cannot be
            // stored, so they are dropped; wallets only unshield whole notes now.
            sol_log_data(&[b"discarded", &c0, &c1]);
        } else {
            let index = tree.insert_pair(&c0, &c1).map_err(|_| ProgramError::from(PoolError::TreeFull))?;
            sol_log_data(&[b"commitment", &c0, &index.to_le_bytes(), enc0]);
            sol_log_data(&[b"commitment", &c1, &(index + 1).to_le_bytes(), enc1]);
        }
    }

    if let Some((asset, vault, recipient, relayer, mint)) = value_accounts {
        let payout = ext_amount.unsigned_abs();
        // The protocol fee comes out of the payout: the notes gave up
        // `payout`, the recipient receives `payout - protocol_fee`.
        let protocol = protocol_fee(pool, payout)?;
        let amount = payout - protocol;
        {
            let mut a = asset.try_borrow_mut_data()?;
            let total = payout.checked_add(fee).ok_or(ProgramError::from(PoolError::AmountOutOfRange))?;
            let balance = u64_at(&a, A_BALANCE);
            require!(total <= balance, PoolError::InsufficientPoolBalance);
            set_u64(&mut a, A_BALANCE, balance - total);
        }
        charge_fee(asset, 1, protocol)?;
        if mint == SOL_MINT {
            // The vault is owned by this program, so lamports move directly.
            pay_lamports(vault, recipient, amount)?;
            pay_lamports(vault, relayer, fee)?;
        } else {
            let mint_info = next_account_info(it)?;
            let token_program = next_account_info(it)?;
            require!(*token_program.key == SPL_TOKEN_ID && *mint_info.key == mint, PoolError::WrongAccount);
            let decimals = asset.try_borrow_data()?[A_DECIMALS];
            let seeds: &[&[u8]] = &[b"pool", &[pool_bump]];
            if amount > 0 {
                token_transfer(token_program, vault, mint_info, recipient, pool, amount, decimals, Some(seeds))?;
            }
            if fee > 0 {
                token_transfer(token_program, vault, mint_info, relayer, pool, fee, decimals, Some(seeds))?;
            }
        }
    }
    Ok(())
}

/// The protocol fee on `amount`, rounded up.
fn protocol_fee(pool: &AccountInfo, amount: u64) -> Result<u64, ProgramError> {
    let d = pool.try_borrow_data()?;
    let bps = u16::from_le_bytes(d[P_FEE_BPS..P_FEE_BPS + 2].try_into().unwrap()) as u128;
    Ok(((amount as u128 * bps + 9_999) / 10_000) as u64)
}

fn charge_fee(asset: &AccountInfo, kind: u8, fee: u64) -> ProgramResult {
    if fee == 0 {
        return Ok(());
    }
    let mut a = asset.try_borrow_mut_data()?;
    let next = u64_at(&a, A_FEES).checked_add(fee).ok_or(ProgramError::from(PoolError::AmountOutOfRange))?;
    set_u64(&mut a, A_FEES, next);
    let mint = key_at(&a, A_MINT);
    sol_log_data(&[b"fee", &[kind], mint.as_ref(), &fee.to_le_bytes()]);
    Ok(())
}

/// accounts: admin (signer), pool.  data: fee_bps u16 (at most MAX_PROTOCOL_FEE_BPS)
fn set_fee(program_id: &Pubkey, accounts: &[AccountInfo], r: &mut Reader) -> ProgramResult {
    let it = &mut accounts.iter();
    let admin = next_account_info(it)?;
    let pool = next_account_info(it)?;
    let bps = r.u16()?;
    r.done()?;
    check_pool(program_id, pool)?;
    check_admin(pool, admin)?;
    require!(bps <= MAX_PROTOCOL_FEE_BPS, PoolError::FeeTooHigh);
    pool.try_borrow_mut_data()?[P_FEE_BPS..P_FEE_BPS + 2].copy_from_slice(&bps.to_le_bytes());
    Ok(())
}

/// Sends every accrued fee of one asset to the fee recipient. Anyone may call.
/// accounts: pool, asset, vault, destination
///   SOL: destination = the fee recipient wallet
///   tokens: destination = a token account owned by the fee recipient for this mint,
///           + mint, token_program
fn collect_fees(program_id: &Pubkey, accounts: &[AccountInfo], r: &mut Reader) -> ProgramResult {
    let it = &mut accounts.iter();
    let pool = next_account_info(it)?;
    let asset = next_account_info(it)?;
    let vault = next_account_info(it)?;
    let destination = next_account_info(it)?;
    r.done()?;
    let pool_bump = check_pool(program_id, pool)?;
    let mint = check_asset(program_id, asset)?;
    check_vault(program_id, pool, asset, vault)?;
    let fee_recipient = key_at(&pool.try_borrow_data()?, P_FEE_RECIPIENT);

    let amount = {
        let mut a = asset.try_borrow_mut_data()?;
        let amount = u64_at(&a, A_FEES);
        require!(amount > 0, PoolError::NothingToCollect);
        set_u64(&mut a, A_FEES, 0);
        amount
    };

    if mint == SOL_MINT {
        require!(*destination.key == fee_recipient, PoolError::WrongAccount);
        pay_lamports(vault, destination, amount)?;
    } else {
        let mint_info = next_account_info(it)?;
        let token_program = next_account_info(it)?;
        require!(*token_program.key == SPL_TOKEN_ID && *mint_info.key == mint, PoolError::WrongAccount);
        {
            // destination must be a token account for this mint, owned by the fee recipient
            require!(destination.owner == &SPL_TOKEN_ID, PoolError::WrongAccount);
            let d = destination.try_borrow_data()?;
            require!(d.len() == TOKEN_ACCOUNT_LEN, PoolError::WrongAccount);
            require!(key_at(&d, 0) == mint && key_at(&d, 32) == fee_recipient, PoolError::WrongAccount);
        }
        let decimals = asset.try_borrow_data()?[A_DECIMALS];
        let seeds: &[&[u8]] = &[b"pool", &[pool_bump]];
        token_transfer(token_program, vault, mint_info, destination, pool, amount, decimals, Some(seeds))?;
    }
    sol_log_data(&[b"fees_collected", mint.as_ref(), &amount.to_le_bytes(), fee_recipient.as_ref()]);
    Ok(())
}

fn pay_lamports(from: &AccountInfo, to: &AccountInfo, amount: u64) -> ProgramResult {
    if amount == 0 {
        return Ok(());
    }
    let mut from_l = from.try_borrow_mut_lamports()?;
    let mut to_l = to.try_borrow_mut_lamports()?;
    **from_l = from_l.checked_sub(amount).ok_or(ProgramError::from(PoolError::InsufficientPoolBalance))?;
    **to_l = to_l.checked_add(amount).ok_or(ProgramError::from(PoolError::AmountOutOfRange))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn system_instructions_keep_the_legacy_wire_format() {
        // Independent golden encoding of Solana's fixed-width SystemInstruction
        // ABI. In particular, switching bincode -> wincode must not change it.
        let payer = Pubkey::new_from_array([1; 32]);
        let target = Pubkey::new_from_array([2; 32]);
        let owner = Pubkey::new_from_array([3; 32]);
        for value in [0, 120, u64::MAX] {
            let create = system_instruction::create_account(&payer, &target, value, value, &owner);
            let mut expected = 0u32.to_le_bytes().to_vec();
            expected.extend_from_slice(&value.to_le_bytes());
            expected.extend_from_slice(&value.to_le_bytes());
            expected.extend_from_slice(owner.as_ref());
            assert_eq!(create.data, expected);
            assert_eq!(create.program_id, system_program::ID);
            assert_eq!(create.accounts, vec![AccountMeta::new(payer, true), AccountMeta::new(target, true)]);

            let transfer = system_instruction::transfer(&payer, &target, value);
            let mut expected = 2u32.to_le_bytes().to_vec();
            expected.extend_from_slice(&value.to_le_bytes());
            assert_eq!(transfer.data, expected);
            assert_eq!(transfer.program_id, system_program::ID);
            assert_eq!(transfer.accounts, vec![AccountMeta::new(payer, true), AccountMeta::new(target, false)]);

            let allocate = system_instruction::allocate(&target, value);
            let mut expected = 8u32.to_le_bytes().to_vec();
            expected.extend_from_slice(&value.to_le_bytes());
            assert_eq!(allocate.data, expected);
            assert_eq!(allocate.program_id, system_program::ID);
            assert_eq!(allocate.accounts, vec![AccountMeta::new(target, true)]);
        }
        let assign = system_instruction::assign(&target, &owner);
        let mut expected = 1u32.to_le_bytes().to_vec();
        expected.extend_from_slice(owner.as_ref());
        assert_eq!(assign.data, expected);
        assert_eq!(assign.program_id, system_program::ID);
        assert_eq!(assign.accounts, vec![AccountMeta::new(target, true)]);
    }

    #[test]
    fn program_addresses_match_the_javascript_client() {
        let program = Pubkey::new_from_array([4; 32]);
        let mint = [3u8; 32];
        let nullifier = [1u8; 32];
        let vectors: &[(&[&[u8]], &str, u8)] = &[
            (&[b"pool"], "E6ce9E9rFDRrWAG5WoXpxKYVScfY7L15R7y7WVkMzpP2", 253),
            (&[b"sol_vault"], "CLRYBir99nZjE6nryJgXkJwRJApGF6vYpxhFvE2iCzpK", 255),
            (&[b"asset", &mint], "9nePycX9AeDfvnQzNtm1GmpRPVwPpzrJ8Np8gyetj2M3", 254),
            (&[b"nullifier", &nullifier], "GLfQKyf8usuufRgSywvK4Fdkc7yS81X3bZxQ8tfi74tt", 255),
        ];
        for (seeds, expected, bump) in vectors {
            let (key, actual_bump) = Pubkey::find_program_address(seeds, &program);
            assert_eq!(key.to_string(), *expected);
            assert_eq!(actual_bump, *bump);
            let bump_seed = [*bump];
            let mut signed_seeds = seeds.to_vec();
            signed_seeds.push(&bump_seed);
            assert_eq!(Pubkey::create_program_address(&signed_seeds, &program).unwrap(), key);
        }
    }

    #[test]
    fn external_data_hash_matches_the_javascript_wire_encoding() {
        let key = Pubkey::new_from_array([4; 32]);
        assert_eq!(ext_data_hash(&key, &key, &key, &key, -5, 7, b"a", b"b"), [
            6, 152, 128, 123, 236, 28, 163, 176, 61, 215, 220, 68, 190, 234, 181, 16,
            8, 168, 173, 13, 53, 181, 21, 253, 86, 85, 176, 178, 73, 17, 93, 96,
        ]);
    }

    #[test]
    fn field_neg_matches_reference() {
        // p - 1
        let mut expected = SCALAR_FIELD_MODULUS;
        expected[31] -= 1;
        assert_eq!(field_neg(1), expected);
        // p - 2^64 - 5 checked against u128 arithmetic on the low limbs
        let v: u128 = (1u128 << 64) + 5;
        let out = field_neg(v);
        // out + v == p
        let mut sum = [0u8; 32];
        let vb = v.to_be_bytes();
        let mut carry = 0u16;
        for i in (0..32).rev() {
            let add = if i >= 16 { vb[i - 16] as u16 } else { 0 };
            let s = out[i] as u16 + add + carry;
            sum[i] = s as u8;
            carry = s >> 8;
        }
        assert_eq!(sum, SCALAR_FIELD_MODULUS);
    }

    #[test]
    fn ext_data_hash_is_a_field_element() {
        let k = Pubkey::new_unique();
        let h = ext_data_hash(&k, &k, &k, &k, -5, 7, b"a", b"b");
        assert!(is_field_element(&h));
        let h2 = ext_data_hash(&k, &k, &k, &k, -5, 8, b"a", b"b");
        assert_ne!(h, h2);
    }

    #[test]
    fn sol_asset_id_is_poseidon_of_zeros() {
        let zero = [0u8; 32];
        assert_eq!(asset_id_of(&SOL_MINT), poseidon(&[&zero, &zero]).unwrap());
    }
}
