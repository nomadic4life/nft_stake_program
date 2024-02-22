import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { NftStakeProgram } from "../target/types/nft_stake_program";

import {
  createMint,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
  createAssociatedTokenAccountInstruction,
  mintTo,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAccount,
  getMint,
} from '@solana/spl-token';

import fs from 'fs/promises';
import util from 'node:util';
import child from 'node:child_process'
import { assert } from "chai";
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

  getAssociatedtoken = async (connection: any, tokenMint: any) => {
    const account = await getOrCreateAssociatedTokenAccount(
      connection,
      this.authority,
      tokenMint.publicKey,
      this.authority.publicKey,
      true
    )

    this.associatedTokenAccount = account.address

    return this.associatedTokenAccount
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


  before(async () => {
    // console.log(process.argv.includes('unstake'))
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


  describe("run each endpoint sequentially:", () => {

    it("initialize program state, signer, and token mint.", async () => {

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

      // console.log("Your transaction signature", tx);

      const latestBlockHash = await connection.getLatestBlockhash()

      await connection.confirmTransaction({
        blockhash: latestBlockHash.blockhash,
        lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
        signature: tx,
      }, "confirmed");
    });


    it("Mint NFT.", async () => {

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
      // console.log("Your transaction signature", tx);
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

      // console.log("Your transaction signature", tx);

      const latestBlockHash = await connection.getLatestBlockhash()

      await connection.confirmTransaction({
        blockhash: latestBlockHash.blockhash,
        lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
        signature: tx,
      }, "confirmed");

      // add assertions to check for if account state is initialized with correct state
      // const account = await getAccount(
      //   provider.connection,
      //   user.nftAccount
      // )

      // const mint = await getMint(
      //   provider.connection,
      //   user.nftMint.publicKey
      // )

      // console.log(account)

      // console.log(mint)
    })


    it("stake NFT.", async () => {

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


      const tx = await program.methods.stakeAccount()
        .accounts({
          authority: user.authority.publicKey,
          programSigner: program_signer,
          lockedAccount: lockedAccount,
          nftOwner: user.nftAccount,
          nftMint: user.nftMint.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([user.authority])
        .rpc();

      // console.log("Your transaction signature", tx);

      const latestBlockHash = await connection.getLatestBlockhash()

      await connection.confirmTransaction({
        blockhash: latestBlockHash.blockhash,
        lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
        signature: tx,
      }, "confirmed");

      // const account = await getAccount(
      //   provider.connection,
      //   user.nftAccount
      // )

      // const mint = await getMint(
      //   provider.connection,
      //   user.nftMint.publicKey
      // )

      // console.log(account)

      // console.log(mint)
    })


    it("unstake NFT.", async () => {

      const {
        mintAuthority: program_signer,
        tokenMint
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

      await user.getAssociatedtoken(provider.connection, tokenMint)


      const tx = await program.methods.unstakeAccount()
        .accounts({
          authority: user.authority.publicKey,
          userAssociatedTokenAccount: user.associatedTokenAccount,
          programSigner: program_signer,
          lockedAccount: lockedAccount,
          nftOwner: user.nftAccount,
          nftMint: user.nftMint.publicKey,
          tokenMint: tokenMint.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([user.authority])
        .rpc();

      // console.log("Your transaction signature", tx);

      const latestBlockHash = await connection.getLatestBlockhash()

      await connection.confirmTransaction({
        blockhash: latestBlockHash.blockhash,
        lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
        signature: tx,
      }, "confirmed");

      // const account = await getAccount(
      //   provider.connection,
      //   user.nftAccount
      // )

      // const mint = await getMint(
      //   provider.connection,
      //   user.nftMint.publicKey
      // )

      // console.log(account)

      // console.log(mint)
    })


    it("close locked account.", async () => {

      const {
        mintAuthority: program_signer,
        payer,
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

      const tx = await program.methods.closeLockedAccount()
        .accounts({
          payer: payer.publicKey,
          programSigner: program_signer,
          lockedAccount: lockedAccount,
        })
        .signers([payer])
        .rpc();

      // console.log("Your transaction signature", tx);

      const latestBlockHash = await connection.getLatestBlockhash()

      await connection.confirmTransaction({
        blockhash: latestBlockHash.blockhash,
        lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
        signature: tx,
      }, "confirmed");

    })

  })


  describe("run test in batch transaction:", () => {

    const user = new User()


    before(async () => {
      await user.generate(provider.connection)
    })


    it("Mint NFT, Init Locked Account, Stake NFT:", async () => {

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

      const mintNFTInstr = await program.methods.mintNft()
        .accounts({
          user: user.authority.publicKey,
          nftAccount: user.nftAccount,
          nftMint: user.nftMint.publicKey,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .prepare()

      const initLockedAccountInstr = await program.methods.initializeLockedAccount(bump)
        .accounts({
          authority: user.authority.publicKey,
          programSigner: program_signer,
          lockedAccount: lockedAccount,
          nftOwner: user.nftAccount,
          nftMint: user.nftMint.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .prepare()

      const tx = await program.methods.stakeAccount()
        .preInstructions([
          mintNFTInstr.instruction,
          initLockedAccountInstr.instruction,
        ])
        .accounts({
          authority: user.authority.publicKey,
          programSigner: program_signer,
          lockedAccount: lockedAccount,
          nftOwner: user.nftAccount,
          nftMint: user.nftMint.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([user.authority, user.nftMint])
        .rpc();

      // console.log("Your transaction signature", tx);

      const latestBlockHash = await connection.getLatestBlockhash()

      await connection.confirmTransaction({
        blockhash: latestBlockHash.blockhash,
        lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
        signature: tx,
      }, "confirmed");


    })


    it("unstake NFT, create ATA for user, mint tokens to user, revoke freeze authority, close locked account", async () => {

      const {
        mintAuthority: program_signer,
        tokenMint
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

      const tokenAccount = getAssociatedTokenAddressSync(
        tokenMint.publicKey,
        user.authority.publicKey,
        true
      )

      const createTokenAccountinstr = createAssociatedTokenAccountInstruction(
        user.authority.publicKey,
        tokenAccount,
        user.authority.publicKey,
        tokenMint.publicKey
      )

      const unstakeAccountInstr = await program.methods.unstakeAccount()
        .accounts({
          authority: user.authority.publicKey,
          userAssociatedTokenAccount: tokenAccount,
          programSigner: program_signer,
          lockedAccount: lockedAccount,
          nftOwner: user.nftAccount,
          nftMint: user.nftMint.publicKey,
          tokenMint: tokenMint.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .prepare()

      const tx = await program.methods.closeLockedAccount()
        .preInstructions([
          createTokenAccountinstr,
          unstakeAccountInstr.instruction,
        ])
        .accounts({
          payer: user.authority.publicKey,
          programSigner: program_signer,
          lockedAccount: lockedAccount,
        })
        .signers([user.authority])
        .rpc();

      // console.log("Your transaction signature", tx);

      const latestBlockHash = await connection.getLatestBlockhash()

      await connection.confirmTransaction({
        blockhash: latestBlockHash.blockhash,
        lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
        signature: tx,
      }, "confirmed");

    })


  })


  describe("TEST ERRORS:", () => {


    it("Transaction fails when Freeze Authority is None", async () => {

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

      try {

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

      } catch (err) {

        assert(err.error.errorCode.code == "ConstraintRaw", "Freeze Authority is None")
      }

    })

    describe("", () => {

      const user = new User()

      before(async () => {

        const [program_signer, bump] = anchor.web3.PublicKey.findProgramAddressSync(
          [Buffer.from("signer")],
          program.programId
        )

        await user.generate(provider.connection)

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
          .rpc()

        const latestBlockHash = await connection.getLatestBlockhash()

        await connection.confirmTransaction({
          blockhash: latestBlockHash.blockhash,
          lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
          signature: tx,
        }, "confirmed");

      })


      it("Transaction fails when Freeze Authority doesn't match authority constraint", async () => {

        const {
          mintAuthority: program_signer,
          payer
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

        try {

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

        } catch (err) {

          assert(err.error.errorCode.code == "ConstraintRaw", "Freeze Authority doesn't match")
        }

      })

    })

  })

});

