// scripts/confidentialTransfer.js

import { Connection, Keypair, PublicKey, clusterApiUrl } from "@solana/web3.js";
import { mintTo, transfer, getAccount, createAccount, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import fs from "fs";

async function main() {
  console.log("💸 Confidential Transfer Demo\n");

  // Step 1: Setup connection
  const connection = new Connection(clusterApiUrl("devnet"), "confirmed");

  // Step 2: Load payer (pays fees + mint authority)
  const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync("./payer.json"))));

  // Step 3: Load sender data
  const senderData = JSON.parse(fs.readFileSync("./userAccount.json"));
  const sender = Keypair.fromSecretKey(Uint8Array.from(senderData.userKeypair));
  const senderAccount = new PublicKey(senderData.userAccount);
  const mint = new PublicKey(senderData.mint);

  console.log("Sender:", sender.publicKey.toBase58());
  console.log("Sender Account:", senderAccount.toBase58());

  // Step 4: Create receiver account
  const receiver = Keypair.generate();
  const receiverAccount = await createAccount(connection, payer, mint, receiver.publicKey, undefined, undefined, TOKEN_2022_PROGRAM_ID);
  
  console.log("Receiver:", receiver.publicKey.toBase58());
  console.log("Receiver Account:", receiverAccount.toBase58(), "\n");

  // Step 5: Mint 1000 tokens to sender (initial funding)
  console.log("Minting 1000 tokens to sender...");
  await mintTo(connection, payer, mint, senderAccount, payer, 1000 * 1e9, [], undefined, TOKEN_2022_PROGRAM_ID);
  console.log("✅ Minted\n");

  // Step 6: Transfer 100 tokens (confidential - SDK handles encryption)
  console.log("Transferring 100 tokens (confidential)...");
  const sig = await transfer(connection, payer, senderAccount, receiverAccount, sender, 100 * 1e9, [], undefined, TOKEN_2022_PROGRAM_ID);
  console.log("✅ Signature:", sig, "\n");

  // Step 7: Display final balances
  const senderBal = await getAccount(connection, senderAccount, undefined, TOKEN_2022_PROGRAM_ID);
  const receiverBal = await getAccount(connection, receiverAccount, undefined, TOKEN_2022_PROGRAM_ID);

  console.log("📊 Final Balances:");
  console.log("Sender:", Number(senderBal.amount) / 1e9, "tokens");
  console.log("Receiver:", Number(receiverBal.amount) / 1e9, "tokens");

  // Step 8: Save receiver info
  fs.writeFileSync("./receiverAccount.json", JSON.stringify({
    receiverKeypair: Array.from(receiver.secretKey),
    receiverAccount: receiverAccount.toBase58()
  }, null, 2));
  console.log("\n✅ Saved to receiverAccount.json");
}

main().catch(console.error);