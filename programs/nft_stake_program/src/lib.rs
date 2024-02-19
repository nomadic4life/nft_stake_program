use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{Mint, Token, TokenAccount},
};

declare_id!("5aAd37dwy2StNmb9dkkmoC7HzWKUgtdJooXWimG5MpX5");

#[program]
pub mod nft_stake_program {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let Initialize {
            new_signer,
            token_account,
            associated_token_account,
            ..
        } = ctx.accounts;

        new_signer.is_initialized = true;
        new_signer.is_signer = true;
        new_signer.program_id = ctx.program_id.clone();
        new_signer.token_account = token_account.key();
        new_signer.associated_token_account = associated_token_account.key();

        return Ok(());
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        init,
        payer = payer,
        space = 8 + 1 + 1 + 32 + 32 + 32,
        seeds = [b"signer"],
        bump,
    )]
    pub new_signer: Account<'info, SignerAccount>,

    #[account(
        init,
        payer = payer,
        mint::decimals = 9,
        mint::authority = new_signer,
        mint::freeze_authority = new_signer,
    )]
    pub token_account: Account<'info, Mint>,

    #[account(
        init,
        payer = payer,
        associated_token::mint = token_account,
        associated_token::authority = new_signer,
        associated_token::token_program = token_program,
    )]
    pub associated_token_account: Account<'info, TokenAccount>,

    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct SignerAccount {
    pub is_initialized: bool,
    pub is_signer: bool,
    pub program_id: Pubkey,
    pub token_account: Pubkey,
    pub associated_token_account: Pubkey,
}

// NOTES:
// Functionality
//      NFT is not transferred out of user’s wallet when staked
//      Authority over NFT token account is delegated to a PDA
//      Program freezes user NFT token account preventing user from transferring the NFT
//      Token account is thawed when user unstakes NFT
//      Authority revoked from PDA so user has control over NFT again
//      Tokens minted to user in the form of staking rewards upon unstaking NFT
//      Unable to “unstake” any NFTs that User did not originally stake
//      Every staker receives tokens of the same token mint as rewards

// INIT:
//  INITIALIZE PROGRAM SIGNER
//  INITIALIZE PROGRAM TOKEN
//  INITIALIZE PROGRAM ASSOCIATED TOKEN ACCOUNT
// MINT TOKENS
// MINT NFT
//      - generate key pair [owner, mint_authority, freeze_authority]
//      - token_program::create_token (owner, mint_authority, freeze_authority)
//      - create_associated_token_account
//      - mint_to 1 token to owner
//      - set mint authority to null
// STAKE NFT
//      - set freeze authority to program.signer
//      - freeze token
//      - set stake date
// UNSTAKE NFT
//      - thaw token
//      - revoke freeze authority
//      - compute stake duration
//      - compute rewards
//      - transfer token rewards to NFT owner
// COLLECT REWARDS

// STATE
// SIGNER
//  - is_initialized
//  - is_signer
//  - program_id
//  - token_mint
//  - associated_token_account
//  :TOKEN_ACCOUNT
//  :ASSOCIATED_TOKEN_ACCOUNT
// LOCKED NFT ACCOUNT
//  - ?owner_account
//  - ?nft_associated_token_account
//  - ?nft_token_account
//  - locked_date
