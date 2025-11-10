use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount};

declare_id!("81rFic2WZSGogUTC2Vewh7qCWJaaXeaoXNs1oJrGrYfC");

#[program]
pub mod noctis_finance {
    use super::*;

    pub fn initialize_confidential_account(
        ctx: Context<InitializeConfidentialAccount>,
    ) -> Result<()> {
        let account = &mut ctx.accounts.confidential_account;
        account.authority = ctx.accounts.authority.key();
        account.bump = ctx.bumps.confidential_account;

        msg!("Confidential account initialized");
        msg!("Authority: {}", account.authority);

        Ok(())
    }

    pub fn confidential_transfer(
        ctx: Context<ConfidentialTransfer>,
        encrypted_amount: Vec<u8>,
    ) -> Result<()> {
        require!(
            encrypted_amount.len() == 8,
            ErrorCode::InvalidEncryptedAmount
        );

        msg!("Confidential transfer simulated");
        msg!("From: {}", ctx.accounts.from.key());
        msg!("To: {}", ctx.accounts.to.key());
        msg!("Encrypted amount (8 bytes): {:?}", encrypted_amount);

        Ok(())
    }
}

#[account]
pub struct ConfidentialAccount {
    pub authority: Pubkey,
    pub bump: u8,
}

impl ConfidentialAccount {
    pub const LEN: usize = 8 + 32 + 1;
}

#[derive(Accounts)]
pub struct InitializeConfidentialAccount<'info> {
    #[account(
        init,
        payer = authority,
        space = ConfidentialAccount::LEN,
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
        mut,
        seeds = [b"confidential", authority.key().as_ref()],
        bump = confidential_account.bump,
        has_one = authority
    )]
    pub confidential_account: Account<'info, ConfidentialAccount>,

    pub authority: Signer<'info>,

    #[account(mut)]
    pub from: Account<'info, TokenAccount>,

    #[account(mut)]
    pub to: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Encrypted amount must be exactly 8 bytes")]
    InvalidEncryptedAmount,
}
