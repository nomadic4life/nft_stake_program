use anchor_lang::prelude::*;
use anchor_spl::{
    // associated_token,
    associated_token::AssociatedToken,
    token::{
        Mint, 
        MintTo, 
        mint_to, 
        Token, 
        TokenAccount, 
        set_authority, 
        SetAuthority, 
    },
};

declare_id!("5aAd37dwy2StNmb9dkkmoC7HzWKUgtdJooXWimG5MpX5");

#[program]
pub mod nft_stake_program {
    use anchor_spl::token::spl_token::instruction::AuthorityType;

    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let Initialize {
            new_signer,
            token_mint,
            token_account,
            ..
        } = ctx.accounts;

        new_signer.is_initialized = true;
        new_signer.is_signer = true;
        new_signer.program_id = ctx.program_id.clone();
        new_signer.token_mint = token_mint.key();
        new_signer.token_account = token_account.key();

        return Ok(());
    }

    pub fn initialize_locked_account(ctx: Context<InitializeLockedAccount>) -> Result<()> {

        let InitializeLockedAccount{
            locked_account,
            authority,
            nft_owner_account,
            nft_mint,
            ..
        } = ctx.accounts;

        locked_account.authority = authority.key();
        locked_account.nft_mint = nft_mint.key();
        locked_account.nft_account = nft_owner_account.key();


        return Ok(());
    }

    pub fn stake_account(ctx: Context<StakeAccount>) -> Result<()> {

        let clock = Clock::get()?;

        // become freeze authority of nft mint
        // freeze mint

        
        ctx.accounts.locked_account.locked_date = clock.unix_timestamp;
        ctx.accounts.locked_account.is_locked = true;

        return Ok(());
    }

    pub fn unstake_account(ctx: Context<StakeAccount>) -> Result<()> {

        let clock = Clock::get()?;

        // thaw mint
        // revoke freeze authority
        // compute rewards
        // transfer rewards

        
        ctx.accounts.locked_account.locked_date = clock.unix_timestamp;
        ctx.accounts.locked_account.is_locked = false;

        return Ok(());
    }

    pub fn mint_tokens(ctx: Context<MintTokens>) -> Result<()> {

        let clock = Clock::get()?;
        let slot = clock.slot;

        msg!("slot: {},", slot);
        msg!("{}", ctx.accounts.authority.key());
        return Ok(());
    }

    pub fn mint_nft(ctx: Context<MintNFT>) -> Result<()> {

        let MintNFT {
            user,
            nft_account,
            nft_mint,
            token_program,
            ..
        } = ctx.accounts;

        mint_to(CpiContext::new(
            token_program.to_account_info(),
            MintTo {
                mint: nft_mint.to_account_info(),
                to: nft_account.to_account_info(),
                authority: user.to_account_info(),
            },
        ), 1)?;

        set_authority(CpiContext::new(
            token_program.to_account_info(),
            SetAuthority {
                current_authority: user.to_account_info(),
                account_or_mint: nft_mint.to_account_info(),
            }

        ), AuthorityType::MintTokens, None)?;

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
        space = 8 + 1 + 1 + 32 + 32 + 32 + 1,
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
    pub token_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = payer,
        associated_token::mint = token_mint,
        associated_token::authority = new_signer,
        associated_token::token_program = token_program,
    )]
    pub token_account: Account<'info, TokenAccount>,

    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitializeLockedAccount<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [b"signer"],
        bump
    )]
    pub program_signer: Account<'info, SignerAccount>,

    #[account(
        init,
        payer = authority,
        space = 8 + 32 + 32 + 32 + 1 + 8,
        seeds = [
            authority.key().as_ref(),
            nft_owner_account.key().as_ref(),            
            nft_mint.key().as_ref(),
            program_signer.key().as_ref(),
        ],
        bump
    )]
    pub locked_account: Account<'info, LockedAccount>,

    #[account(
        // need verify NFT is not frozen, authority is owner, and is correct mint, and account is holding NFT
        constraint = !nft_owner_account.is_frozen() 
        && nft_owner_account.amount == 1
        && nft_owner_account.mint.key().as_ref() == nft_mint.key().as_ref()
        && nft_owner_account.owner.key().as_ref() == authority.key().as_ref()
    )]
    pub nft_owner_account: Account<'info, TokenAccount>,

    #[account(
        // need to verify is an NFT and meets SPL SPEC
        constraint = nft_mint.mint_authority.is_none()
        && nft_mint.supply == 1 && nft_mint.decimals == 0
        // && nft_mint.freeze_authority.unwrap() == authority.key().as_ref()
    )]
    pub nft_mint: Account<'info, Mint>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct MintTokens<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [b"signer"],
        bump
    )]
    pub program_signer: Account<'info, SignerAccount>,

    #[account(
        has_one = authority
    )]
    pub locked_account: Account<'info, LockedAccount>,

    #[account(
        constraint = user_associated_token_account.owner.as_ref() == authority.key().as_ref()
    )]
    pub user_associated_token_account: Account<'info, TokenAccount>,

    #[account(
        mint::authority = program_signer
    )]
    pub token_account: Account<'info, Mint>,

    pub nft_account: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct MintNFT<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        init,
        payer = user,
        mint::authority = user,
        mint::decimals = 0,
        mint::freeze_authority = user,
    )]
    pub nft_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = user,
        associated_token::mint = nft_mint,
        associated_token::authority = user
    )]
    pub nft_account: Account<'info, TokenAccount>,


    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct StakeAccount<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [b"signer"],
        bump
    )]
    pub program_signer: Account<'info, SignerAccount>,

    #[account(
        seeds = [
            authority.key().as_ref(),
            nft_owner.key().as_ref(),            
            nft_mint.key().as_ref(),
            program_signer.key().as_ref(),
        ],
        bump
    )]
    pub locked_account: Account<'info, LockedAccount>,

    pub nft_owner: Account<'info, TokenAccount>,
    pub nft_mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
}

#[account]
pub struct SignerAccount {
    pub is_initialized: bool,
    pub is_signer: bool,
    pub program_id: Pubkey,
    pub token_mint: Pubkey,
    pub token_account: Pubkey,
    pub bump: u8,
}

#[account]
pub struct LockedAccount {
    pub authority: Pubkey,
    pub nft_mint: Pubkey,
    pub nft_account: Pubkey,
    // pub owner: Pubkey,
    pub is_locked: bool,
    pub locked_date: i64,
    pub bump: u8,
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
