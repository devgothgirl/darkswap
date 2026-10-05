//! TEST ONLY. Writes ~12 KB of logs so that a pool instruction later in the
//! same transaction has its logs cut off. The Solana end-to-end test uses it
//! to prove that wallet sync does not depend on logs.
use solana_account_info::AccountInfo;
use solana_program_entrypoint::{entrypoint, ProgramResult};
use solana_msg::msg;
use solana_pubkey::Pubkey;
entrypoint!(process_instruction);
fn process_instruction(_p: &Pubkey, _a: &[AccountInfo], d: &[u8]) -> ProgramResult {
    let n = if d.is_empty() { 60 } else { d[0] as usize };
    let s = "x".repeat(200);
    for _ in 0..n { msg!("{}", s); }
    Ok(())
}
