import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { NoctisFinance } from "../target/types/noctis_finance";
import {
  TOKEN_2022_PROGRAM_ID,
  createMint,
  createAccount,
  mintTo,
  getAccount,
} from "@solana/spl-token";
import { expect } from "chai";

describe("noctis-finance", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.NoctisFinance as Program<NoctisFinance>;
  const payer = provider.wallet as anchor.Wallet;

  let mint: anchor.web3.PublicKey;
  let userTokenAccount: anchor.web3.PublicKey;
  let recipientTokenAccount: anchor.web3.PublicKey;
  let confidentialAccountPda: anchor.web3.PublicKey;
  let recipientKeypair: anchor.web3.Keypair;

  console.log("🔧 Setting up test accounts...\n");

  before(async () => {
    // Generate recipient keypair
    recipientKeypair = anchor.web3.Keypair.generate();

    // Airdrop SOL
    console.log("💰 Airdropping 2 SOL to recipient...");
    const airdropSig = await provider.connection.requestAirdrop(
      recipientKeypair.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSig);
    console.log("   ✅ Airdrop confirmed");

    // Create Token-2022 mint
    console.log("🪙 Creating mint...");
    mint = await createMint(
      provider.connection,
      payer.payer,
      payer.publicKey,
      null,
      9,
      undefined,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );
    console.log("   ✅ Mint created:", mint.toBase58());

    // Create user token account
    console.log("👤 Creating user token account...");
    userTokenAccount = await createAccount(
      provider.connection,
      payer.payer,
      mint,
      payer.publicKey,
      undefined,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );
    console.log("   ✅ Token Account:", userTokenAccount.toBase58());

    // Mint tokens
    console.log("🔨 Minting 1000 tokens...");
    await mintTo(
      provider.connection,
      payer.payer,
      mint,
      userTokenAccount,
      payer.publicKey,
      1000 * 10 ** 9,
      [],
      undefined,
      TOKEN_2022_PROGRAM_ID
    );
    console.log("   ✅ Tokens minted");

    // Create recipient token account
    console.log("👥 Creating recipient token account...");
    recipientTokenAccount = await createAccount(
      provider.connection,
      payer.payer,
      mint,
      recipientKeypair.publicKey,
      undefined,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );
    console.log("   ✅ Token Account:", recipientTokenAccount.toBase58());

    // Derive PDA for confidential account
    [confidentialAccountPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("confidential"), payer.publicKey.toBuffer()],
      program.programId
    );
    console.log("🔑 Confidential PDA:", confidentialAccountPda.toBase58());
  });

  it("✅ Initializes a confidential account", async () => {
    console.log("\n🧪 TEST 1: Initialize confidential account\n");

    const tx = await program.methods
      .initializeConfidentialAccount()
      .accounts({
        confidentialAccount: confidentialAccountPda,
        authority: payer.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    console.log("📝 Transaction signature:", tx);

    // Verification
    const account = await program.account.confidentialAccount.fetch(
      confidentialAccountPda
    );

    expect(account.authority.toBase58()).to.equal(payer.publicKey.toBase58());
    console.log("✅ Confidential account initialized successfully!");
  });

  it("🔒 Executes a simulated confidential transfer", async () => {
    console.log("\n🧪 TEST 2: Confidential transfer\n");

    // Create encrypted amount (8 bytes)
    const encryptedAmount = Buffer.alloc(8);
    encryptedAmount.writeBigUInt64LE(BigInt(100));

    console.log("   From:", userTokenAccount.toBase58());
    console.log("   To:", recipientTokenAccount.toBase58());
    console.log("   Encrypted Amount:", encryptedAmount.length, "bytes");

    const tx = await program.methods
      .confidentialTransfer(encryptedAmount)
      .accounts({
        confidentialAccount: confidentialAccountPda,
        authority: payer.publicKey,
        from: userTokenAccount,
        to: recipientTokenAccount,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();

    console.log("📝 Transaction signature:", tx);
    console.log("✅ Confidential transfer executed!");
  });

  it("❌ Rejects transfer with empty amount", async () => {
    console.log("\n🧪 TEST 3: Validate encrypted amount\n");

    const invalidAmount = Buffer.alloc(0);

    try {
      await program.methods
        .confidentialTransfer(invalidAmount)
        .accounts({
          confidentialAccount: confidentialAccountPda,
          authority: payer.publicKey,
          from: userTokenAccount,
          to: recipientTokenAccount,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();

      expect.fail("Transfer should have failed");
    } catch (error) {
      console.log("✅ Expected error caught:");
      console.log(`   ${error.message}`);
      
      expect(
        error.message.includes("InvalidEncryptedAmount") ||
        error.message.includes("requires (length 8)")
      ).to.be.true;
    }
  });
});

