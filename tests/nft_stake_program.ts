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

  owner: anchor.web3.Keypair;
  mintAuthority: anchor.web3.Keypair;
  freezeAuthority: anchor.web3.Keypair;
  tokenMint: anchor.web3.PublicKey;

  constructor() {
  }

  generate = async (anchor: any, provider: any) => {
    const { Keypair } = anchor.web3
    const { connection } = provider
    this.owner = Keypair.generate();
    this.mintAuthority = this.owner;
    this.freezeAuthority = this.owner;

    const airdropSignature = await connection.requestAirdrop(this.owner.publicKey, 100 * LAMPORTS_PER_SOL)
    const latestBlockHash = await connection.getLatestBlockhash()

    await connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: airdropSignature,
    })
  }

  mint = async (provider: any) => {
    const { connection } = provider
    this.tokenMint = await createMint(
      connection,
      this.owner,
      this.mintAuthority.publicKey,
      this.freezeAuthority.publicKey,
      9
    )
  }

  getTokenAccount = async (provider: any, owner: any) => {

    const { connection } = provider
    const { publicKey } = owner
    const payer = this.owner
    const mint = this.tokenMint

    return await getOrCreateAssociatedTokenAccount(
      connection,
      payer,
      mint,
      publicKey
    )
  }

  airdrop = async (provider: any, owner: any, amount: any) => {

    const { connection } = provider
    const { publicKey } = owner
    const payer = this.owner
    const mint = this.tokenMint
    const mintAuthority = this.mintAuthority


    // // need airdrop sol first
    // await connection.requestAirdrop(publicKey, 100 * LAMPORTS_PER_SOL)

    const tokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      payer,
      mint,
      publicKey
    )

    await mintTo(
      connection,
      payer,
      mint,
      tokenAccount.address,
      mintAuthority,
      amount
    )

  }

  getProgramTokenAccount = async (provider, seed, programId) => {

    const [authorhizeAccount, bump] = anchor.web3.PublicKey.findProgramAddressSync(
      seed,
      programId
    )

    return await this.getTokenAccount(provider, { owner: authorhizeAccount })
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


  before("", async () => {
    console.log(process.argv.includes('unstake'))
    // await exec('solana-keygen new -o ./dependencies/wallets/main.json --force --no-bip39-passphrase')
    // await exec('solana airdrop 100 --keypair ./dependencies/wallets/main.json --commitment finalized')
    // await exec('solana program deploy ./dependencies/deploy/token_program.so --keypair ./dependencies/wallets/main.json --commitment finalized')
    // await exec('solana program deploy ./dependencies/deploy/associated_token_program.so --keypair ./dependencies/wallets/main.json --commitment finalized')



  })

  it("false test case!", async () => {

    const [program_signer, bump] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("signer")],
      program.programId
    )

    const payer = anchor.web3.Keypair.generate()
    const tokenMint = anchor.web3.Keypair.generate()
    const tokenAccount = getAssociatedTokenAddressSync(tokenMint.publicKey, program_signer, true)

    console.log(program_signer)
    console.log(program.programId)

    const airdropSignature = await connection.requestAirdrop(payer.publicKey, 2 * LAMPORTS_PER_SOL)
    const latestBlockHash = await connection.getLatestBlockhash()

    await connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: airdropSignature,
    }, "finalized");


    const tx = await program.methods.initialize()
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
  });



});

