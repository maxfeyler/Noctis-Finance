import { Connection, Keypair, clusterApiUrl, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { createMint, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import fs from "fs";

async function main() {
  try {
    // 1. RPC selection (env override for local validator)
    const RPC = process.env.RPC_URL || clusterApiUrl("devnet");
    const connection = new Connection(RPC, "confirmed");

    // 2. Load fixed payer
    const payer = Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(fs.readFileSync("./payer.json")))
    );
    console.log("Payer address:", payer.publicKey.toBase58());

    // 3. Ensure funds
    const balance = await connection.getBalance(payer.publicKey);
    console.log("Current balance:", balance / LAMPORTS_PER_SOL, "SOL");
    if (balance < 1 * LAMPORTS_PER_SOL) {
      console.log("Requesting airdrop...");
      const sig = await connection.requestAirdrop(payer.publicKey, 2 * LAMPORTS_PER_SOL);
      await connection.confirmTransaction(sig, "confirmed");
      console.log("Airdrop done ✅");
    }

    // 4. Create confidential mint
    const mint = await createMint(
      connection,
      payer,
      payer.publicKey, // mintAuthority
      null,             // freezeAuthority
      9,                // decimals
      undefined,        // auto-generated keypair
      { confidentialTransfer: true },
      TOKEN_2022_PROGRAM_ID
    );
    console.log("✅ Confidential Mint created:", mint.toBase58());

  } catch (err) {
    console.error("Error creating confidential mint:", err);
    if (err.logs) console.error("Transaction logs:", err.logs);
  }
}

main();
