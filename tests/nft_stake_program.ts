import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { NftStakeProgram } from "../target/types/nft_stake_program";

import {
  createMint,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';

import fs from 'fs/promises';
import util from 'node:util';
import child from 'node:child_process'
const exec = util.promisify(child.exec)

const {
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
  SystemProgram
} = anchor.web3

class Token {

  payer: anchor.web3.Keypair;
  mintAuthority: anchor.web3.PublicKey;
  freezeAuthority: anchor.web3.PublicKey;
  tokenMint: anchor.web3.Keypair;

  generate = async (anchor: any, provider: any, authority: any) => {

    const { tokenMint, owner } = authority
    const { Keypair } = anchor.web3
    const { connection } = provider

    this.mintAuthority = owner;
    this.freezeAuthority = owner;
    this.tokenMint = tokenMint;
    this.payer = Keypair.generate()

    const airdropSignature = await connection.requestAirdrop(this.payer.publicKey, 2 * LAMPORTS_PER_SOL)
    const latestBlockHash = await connection.getLatestBlockhash()

    await connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: airdropSignature,
    }, "finalized");
  }

  getAccounts() {

    return {
      payer: this.payer,
      mintAuthority: this.mintAuthority,
      freezeAuthority: this.freezeAuthority,
      tokenMint: this.tokenMint,
    }
  }

  getBump(program: any) {
    const [_, bump] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("signer")],
      program.programId
    )

    return bump
  }

}

class User {
  authority: anchor.web3.Keypair;
  associatedTokenAccount: anchor.web3.PublicKey;
  nftAccount: anchor.web3.PublicKey;
  nftMint: anchor.web3.Keypair;

  generate = async (connection: any) => {

    const user = Keypair.generate()
    const mint = Keypair.generate()
    const account = getAssociatedTokenAddressSync(mint.publicKey, user.publicKey, true)

    const airdropSignature = await connection.requestAirdrop(user.publicKey, 2 * LAMPORTS_PER_SOL)
    const latestBlockHash = await connection.getLatestBlockhash()

    await connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: airdropSignature,
    }, "confirmed");

    this.authority = user
    this.nftAccount = account
    this.nftMint = mint
  }
}

class Chain {
  blockHeight: any;
  clusterNodes: any;
  genesisHash: any;
  latestBlockHash: any;
  minimumLedgerSlot: any;
  slot: any;
  txCount: any;

  get = async (provider) => {


    return Promise.all([
      this.blockHeight = await provider.connection.getBlockHeight(),
      this.clusterNodes = await provider.connection.getClusterNodes(),
      this.genesisHash = await provider.connection.getGenesisHash(),
      this.latestBlockHash = await provider.connection.getLatestBlockhashAndContext(),
      this.minimumLedgerSlot = await provider.connection.getMinimumLedgerSlot(),
      this.slot = await provider.connection.getSlot(),
      this.txCount = await provider.connection.getTransactionCount(),
    ])
  }
}


describe("nft_stake_program", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const provider = anchor.getProvider()
  const { connection } = provider

  const program = anchor.workspace.NftStakeProgram as Program<NftStakeProgram>;
  const token = new Token()
  const user = new User()

  before("", async () => {
    console.log(process.argv.includes('unstake'))
    // await exec('solana-keygen new -o ./dependencies/wallets/main.json --force --no-bip39-passphrase')
    // await exec('solana airdrop 100 --keypair ./dependencies/wallets/main.json --commitment finalized')
    // await exec('solana program deploy ./dependencies/deploy/token_program.so --keypair ./dependencies/wallets/main.json --commitment finalized')
    // await exec('solana program deploy ./dependencies/deploy/associated_token_program.so --keypair ./dependencies/wallets/main.json --commitment finalized')

    const [program_signer, bump] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("signer")],
      program.programId
    )

    const tokenMint = anchor.web3.Keypair.generate()


    await token.generate(anchor, provider, {
      owner: program_signer,
      tokenMint: tokenMint,
    })

    await user.generate(provider.connection)

  })

  it("initialize program state, signer, and token mint", async () => {

    const {
      tokenMint,
      mintAuthority: program_signer,
      payer,
    } = token.getAccounts()

    const tokenAccount = getAssociatedTokenAddressSync(
      tokenMint.publicKey,
      program_signer,
      true
    )

    const bump = token.getBump(program)


    const tx = await program.methods.initialize(bump)
      .accounts({
        payer: payer.publicKey,
        newSigner: program_signer,
        tokenMint: tokenMint.publicKey,
        tokenAccount: tokenAccount,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([payer, tokenMint])
      .rpc();
    console.log("Your transaction signature", tx);

    const latestBlockHash = await connection.getLatestBlockhash()

    await connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: tx,
    }, "confirmed");
  });


  it("Mint NFT", async () => {

    const tx = await program.methods.mintNft()
      .accounts({
        user: user.authority.publicKey,
        nftAccount: user.nftAccount,
        nftMint: user.nftMint.publicKey,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([user.authority, user.nftMint])
      .rpc();
    console.log("Your transaction signature", tx);


  })



  it("initialize locked account state to keep track of staked NFT.", async () => {

    const {
      mintAuthority: program_signer,
    } = token.getAccounts()

    const [lockedAccount, bump] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        user.authority.publicKey.toBuffer(),
        user.nftAccount.toBuffer(),
        user.nftMint.publicKey.toBuffer(),
        program_signer.toBuffer(),
      ],
      program.programId
    )

    const tx = await program.methods.initializeLockedAccount(bump)
      .accounts({
        authority: user.authority.publicKey,
        programSigner: program_signer,
        lockedAccount: lockedAccount,
        nftOwner: user.nftAccount,
        nftMint: user.nftMint.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([user.authority])
      .rpc();
    console.log("Your transaction signature", tx);

    const latestBlockHash = await connection.getLatestBlockhash()

    await connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: tx,
    }, "confirmed");
  })


});

