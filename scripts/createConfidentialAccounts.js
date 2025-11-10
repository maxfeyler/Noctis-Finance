// scripts/createConfidentialAccounts.js

import { Connection, Keypair, PublicKey, clusterApiUrl } from "@solana/web3.js";
import { createAccount, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import fs from "fs";

async function main() {
  console.log("🚀 Creating Confidential Accounts\n");

  // 1. Connection setup
  const connection = new Connection(clusterApiUrl("devnet"), "confirmed");

  // 2. Load payer (pays for rent + fees)
  const payer = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync("./payer.json")))
  );
  console.log("Payer:", payer.publicKey.toBase58());

  // 3. Load or generate user (token owner)
  const user = Keypair.generate(); // For demo. In prod: load from wallet
  console.log("User:", user.publicKey.toBase58());

  // 4. Your confidential mint address
  const mint = new PublicKey("A64tb5QdzygUZsFbLXtf8zZZi79jezSSSEVHpU2YabtL");
  console.log("Mint:", mint.toBase58(), "\n");

  // 5. Create token account (confidential by default if mint has extension)
  const account = await createAccount(
    connection,
    payer,           // Who pays
    mint,            // Which token
    user.publicKey,  // Who owns the account
    undefined,       // Keypair (optional, ATA if undefined)
    undefined,       // Confirmation
    TOKEN_2022_PROGRAM_ID
  );

  console.log("✅ Account created:", account.toBase58());

  // 6. Save for next steps
  const data = {
    userKeypair: Array.from(user.secretKey),
    userAccount: account.toBase58(),
    mint: mint.toBase58()
  };
  fs.writeFileSync("./userAccount.json", JSON.stringify(data, null, 2));
  console.log("✅ Saved to userAccount.json");
}

main().catch(console.error);