use anchor_lang::prelude::*;
use anchor_spl::token_interface::{TokenAccount, TokenInterface};

declare_id!("FQpdDs7QNnedPeWejKihHn6ythcADf1XG1voELR9JY85");

/// Size of a Token-2022 confidential-transfer ciphertext payload accepted by
/// `confidential_transfer`. The PoC currently only validates the shape of the
/// payload; no encryption or proof verification happens on-chain yet.
pub const ENCRYPTED_AMOUNT_LEN: usize = 8;

#[program]
pub mod noctis_finance {
    use super::*;

    pub fn initialize_confidential_account(
        ctx: Context<InitializeConfidentialAccount>,
    ) -> Result<()> {
        let account = &mut ctx.accounts.confidential_account;
        account.authority = ctx.accounts.authority.key();
        account.bump = ctx.bumps.confidential_account;

        msg!("Confidential account initialized for {}", account.authority);
        Ok(())
    }

    pub fn confidential_transfer(
        ctx: Context<ConfidentialTransfer>,
        encrypted_amount: Vec<u8>,
    ) -> Result<()> {
        require!(
            encrypted_amount.len() == ENCRYPTED_AMOUNT_LEN,
            ErrorCode::InvalidEncryptedAmount
        );
        require_keys_eq!(
            ctx.accounts.from.mint,
            ctx.accounts.to.mint,
            ErrorCode::MintMismatch
        );
        require_keys_eq!(
            ctx.accounts.from.owner,
            ctx.accounts.authority.key(),
            ErrorCode::Unauthorized
        );

        msg!("Confidential transfer simulated");
        msg!("From: {}", ctx.accounts.from.key());
        msg!("To: {}", ctx.accounts.to.key());
        Ok(())
    }
}

#[account]
#[derive(InitSpace)]
pub struct ConfidentialAccount {
    pub authority: Pubkey,
    pub bump: u8,
}

#[derive(Accounts)]
pub struct InitializeConfidentialAccount<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + ConfidentialAccount::INIT_SPACE,
        seeds = [b"confidential", authority.key().as_ref()],
        bump
    )]
    pub confidential_account: Account<'info, ConfidentialAccount>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ConfidentialTransfer<'info> {
    #[account(
        seeds = [b"confidential", authority.key().as_ref()],
        bump = confidential_account.bump,
        has_one = authority
    )]
    pub confidential_account: Account<'info, ConfidentialAccount>,

    pub authority: Signer<'info>,

    /// Works with both the legacy SPL Token program and Token-2022.
    #[account(mut, token::token_program = token_program)]
    pub from: InterfaceAccount<'info, TokenAccount>,

    #[account(mut, token::token_program = token_program)]
    pub to: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Encrypted amount must be exactly 8 bytes")]
    InvalidEncryptedAmount,
    #[msg("Source and destination accounts must share the same mint")]
    MintMismatch,
    #[msg("Authority does not own the source token account")]
    Unauthorized,
}
