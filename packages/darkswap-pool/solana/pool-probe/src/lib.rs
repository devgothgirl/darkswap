//! A throwaway Solana program for phase 1. It holds no funds and no state.
//! It exists to prove, on a real validator, that the proof check and the
//! hashing fit Solana's compute budget, and to measure what they cost.
//!
//! Instructions (first byte is the tag):
//!   0  verify   : proof_a(64) | proof_b(128) | proof_c(64) | 8 public inputs (8 x 32)
//!   1  poseidon : n x 32-byte inputs, 1 <= n <= 4  -> return data = hash
//!   2  tree     : (no data) hashes an empty depth-26 tree     -> return data = root

use darkswap_verifier_parity::merkle::{LEVELS, ZERO_LEAF};
use darkswap_verifier_parity::{poseidon, verify_transaction, Field};
use solana_account_info::AccountInfo;
use solana_cpi::set_return_data;
use solana_msg::msg;
use solana_program_entrypoint::{entrypoint, ProgramResult};
use solana_program_error::ProgramError;
use solana_program_log::log_compute_units as sol_log_compute_units;
use solana_pubkey::Pubkey;

entrypoint!(process_instruction);

fn process_instruction(_program_id: &Pubkey, _accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    let (tag, rest) = data.split_first().ok_or(ProgramError::InvalidInstructionData)?;
    match tag {
        0 => {
            if rest.len() != 64 + 128 + 64 + 8 * 32 {
                return Err(ProgramError::InvalidInstructionData);
            }
            let proof_a: &[u8; 64] = rest[0..64].try_into().unwrap();
            let proof_b: &[u8; 128] = rest[64..192].try_into().unwrap();
            let proof_c: &[u8; 64] = rest[192..256].try_into().unwrap();
            let mut public_inputs = [[0u8; 32]; 8];
            for (i, chunk) in rest[256..].chunks_exact(32).enumerate() {
                public_inputs[i].copy_from_slice(chunk);
            }
            sol_log_compute_units();
            verify_transaction(proof_a, proof_b, proof_c, &public_inputs).map_err(|e| {
                msg!("proof rejected: {:?}", e);
                ProgramError::Custom(1)
            })?;
            sol_log_compute_units();
            msg!("proof accepted");
            Ok(())
        }
        1 => {
            if rest.is_empty() || rest.len() % 32 != 0 || rest.len() > 4 * 32 {
                return Err(ProgramError::InvalidInstructionData);
            }
            let inputs: Vec<Field> = rest.chunks_exact(32).map(|c| c.try_into().unwrap()).collect();
            let refs: Vec<&Field> = inputs.iter().collect();
            let hash = poseidon(&refs).ok_or(ProgramError::Custom(2))?;
            set_return_data(&hash);
            Ok(())
        }
        2 => {
            sol_log_compute_units();
            let mut node = ZERO_LEAF;
            for _ in 0..LEVELS {
                node = poseidon(&[&node, &node]).ok_or(ProgramError::Custom(2))?;
            }
            sol_log_compute_units();
            set_return_data(&node);
            Ok(())
        }
        _ => Err(ProgramError::InvalidInstructionData),
    }
}
