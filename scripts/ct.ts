/**
 * Noctis — end-to-end confidential transfer demo on Token-2022.
 *
 * Runs the full lifecycle with the official Solana SDK, no custom program:
 *   1. create a mint with the ConfidentialTransfer extension
 *   2. derive ElGamal + AES keys for sender and recipient from a wallet signature
 *   3. configure both confidential token accounts (pubkey-validity proof)
 *   4. mint public tokens to the sender, deposit them, apply the pending balance
 *   5. confidential transfer (equality + validity + range proofs)
 *   6. recipient applies its pending balance and decrypts both balances locally
 *   7. recipient withdraws part of it back to a public balance
 *
 * Env:
 *   RPC_URL   default http://127.0.0.1:8899 (solana-test-validator)
 *   KEYPAIR   default ~/.config/solana/id.json (payer + sender)
 *   AMOUNT    UI amount to mint/deposit (default 100)
 *   SEND      UI amount to transfer     (default 42.5)
 *   DECIMALS  default 2
 */
import { homedir } from "node:os";
import { join } from "node:path";
import {
  address,
  createClient,
  generateKeyPairSigner,
  type Address,
  type KeyPairSigner,
} from "@solana/kit";
import { solanaRpc } from "@solana/kit-plugin-rpc";
import { signerFromFile } from "@solana/kit-plugin-signer";
import {
  TOKEN_2022_PROGRAM_ADDRESS,
  extension,
  fetchToken,
  findAssociatedTokenPda,
  getConfidentialDepositInstruction,
  getCreateMintInstructionPlan,
  getMintToInstruction,
} from "@solana-program/token-2022";
import {
  deriveAeKeyForOwnerMint,
  deriveElGamalKeypairForOwnerMint,
  fetchConfidentialTransferBalance,
  getApplyConfidentialPendingBalanceInstructionFromToken,
  getConfidentialTransferInstructionPlan,
  getConfidentialWithdrawInstructionPlan,
  getCreateConfidentialTransferAccountInstructionPlan,
} from "@solana-program/token-2022/confidential";
import { AeKey, ElGamalKeypair, ElGamalSecretKey } from "@solana/zk-sdk";

// ---------- config ----------
const RPC_URL = process.env.RPC_URL ?? "http://127.0.0.1:8899";
const KEYPAIR = process.env.KEYPAIR ?? join(homedir(), ".config/solana/id.json");
const DECIMALS = Number(process.env.DECIMALS ?? 2);
const toBase = (ui: string) => BigInt(Math.round(Number(ui) * 10 ** DECIMALS));
const MINT_AMOUNT = toBase(process.env.AMOUNT ?? "100");
const SEND_AMOUNT = toBase(process.env.SEND ?? "42.5");
const WITHDRAW_AMOUNT = SEND_AMOUNT / 2n;
const ui = (base: bigint) => (Number(base) / 10 ** DECIMALS).toFixed(DECIMALS);

const cluster = /devnet/.test(RPC_URL) ? "devnet" : /mainnet/.test(RPC_URL) ? "mainnet" : null;
const explorer = (sig: string) =>
  cluster ? `https://explorer.solana.com/tx/${sig}?cluster=${cluster}` : sig;

// ---------- helpers ----------
let t0 = Date.now();
function step(title: string) {
  t0 = Date.now();
  console.log(`\n▸ ${title}`);
}
function elapsed(label = "step") {
  console.log(`   ⏱ ${label} ${Date.now() - t0} ms`);
}
/** Collect every transaction signature from a (possibly nested) plan result. */
function signaturesOf(result: unknown, out: string[] = []): string[] {
  if (Array.isArray(result)) result.forEach((r) => signaturesOf(r, out));
  else if (result && typeof result === "object") {
    for (const [k, v] of Object.entries(result as Record<string, unknown>)) {
      if (k === "signature" && typeof v === "string") out.push(v);
      else if (v && typeof v === "object") signaturesOf(v, out);
    }
  }
  return out;
}
function logSigs(result: unknown) {
  for (const s of signaturesOf(result)) console.log(`   tx ${explorer(s)}`);
}

type ConfidentialKeys = {
  signer: KeyPairSigner;
  token: Address;
  elgamalKeypair: ElGamalKeypair;
  aesKey: AeKey;
};

/** Derive the confidential keys for (owner, mint) from a wallet signature. */
async function deriveKeys(signer: KeyPairSigner, mint: Address): Promise<ConfidentialKeys> {
  const eg = await deriveElGamalKeypairForOwnerMint({ signer, owner: signer.address, mint });
  const ae = await deriveAeKeyForOwnerMint({ signer, owner: signer.address, mint });
  const [token] = await findAssociatedTokenPda({
    owner: signer.address,
    mint,
    tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
  });
  return {
    signer,
    token,
    elgamalKeypair: ElGamalKeypair.fromSecretKey(ElGamalSecretKey.fromBytes(eg.secretKey)),
    aesKey: AeKey.fromBytes(ae),
  };
}

// ---------- main ----------
const client = await createClient()
  .use(signerFromFile(KEYPAIR))
  // The confidential helpers put the range proof inline in the verify
  // instruction; that transaction is near the size limit and cannot take an
  // extra compute-budget instruction, so resource estimation must be off.
  .use(solanaRpc({ rpcUrl: RPC_URL, transactionConfig: { estimateResourceLimits: false } }));

const payer = client.payer;
console.log(`RPC     ${RPC_URL}`);
console.log(`Payer   ${payer.address}`);

step("1. Create mint with ConfidentialTransfer extension");
const mintSigner = await generateKeyPairSigner();
const mint = mintSigner.address;
const createMintPlan = await getCreateMintInstructionPlan(client, {
  payer,
  newMint: mintSigner,
  decimals: DECIMALS,
  mintAuthority: payer,
  extensions: [
    extension("ConfidentialTransferMint", {
      authority: payer.address,
      autoApproveNewAccounts: true,
      auditorElgamalPubkey: null,
    }),
  ],
});
logSigs(await client.sendTransactions(createMintPlan));
console.log(`   mint ${mint}`);
elapsed();

step("2. Derive ElGamal + AES keys (sender, recipient)");
const recipientSigner = await generateKeyPairSigner();
const sender = await deriveKeys(payer, mint);
const recipient = await deriveKeys(recipientSigner, mint);
console.log(`   sender    ${sender.signer.address}\n   recipient ${recipient.signer.address}`);
elapsed();

step("3. Configure confidential token accounts");
for (const who of [sender, recipient]) {
  const plan = await getCreateConfidentialTransferAccountInstructionPlan({
    payer,
    owner: who.signer,
    mint,
    rpc: client.rpc,
    elgamalKeypair: who.elgamalKeypair,
    aesKey: who.aesKey,
  });
  logSigs(await client.sendTransactions(plan));
  console.log(`   token ${who.token}`);
}
elapsed();

step(`4. Mint ${ui(MINT_AMOUNT)} public tokens, deposit, apply pending balance`);
logSigs(
  await client.sendTransaction([
    getMintToInstruction({ mint, token: sender.token, mintAuthority: payer, amount: MINT_AMOUNT }),
    getConfidentialDepositInstruction({
      token: sender.token,
      mint,
      authority: sender.signer,
      amount: MINT_AMOUNT,
      decimals: DECIMALS,
    }),
  ]),
);
async function applyPending(who: ConfidentialKeys) {
  const acct = await fetchToken(client.rpc, who.token);
  const ix = getApplyConfidentialPendingBalanceInstructionFromToken({
    token: who.token,
    tokenAccount: acct.data,
    authority: who.signer,
    elgamalSecretKey: who.elgamalKeypair.secret(),
    aesKey: who.aesKey,
  });
  logSigs(await client.sendTransaction([ix]));
}
await applyPending(sender);

async function balance(who: ConfidentialKeys) {
  return fetchConfidentialTransferBalance({
    token: who.token,
    rpc: client.rpc,
    elgamalSecretKey: who.elgamalKeypair.secret(),
    aesKey: who.aesKey,
  });
}
console.log(`   sender available: ${ui((await balance(sender)).availableBalance)}`);
elapsed();

step(`5. Confidential transfer of ${ui(SEND_AMOUNT)} → recipient`);
const [srcAcct, dstAcct] = await Promise.all([
  fetchToken(client.rpc, sender.token),
  fetchToken(client.rpc, recipient.token),
]);
const transferPlan = await getConfidentialTransferInstructionPlan({
  sourceToken: sender.token,
  mint,
  destinationToken: recipient.token,
  sourceTokenAccount: srcAcct.data,
  destinationTokenAccount: dstAcct.data,
  authority: sender.signer,
  amount: SEND_AMOUNT,
  sourceElgamalKeypair: sender.elgamalKeypair,
  aesKey: sender.aesKey,
  payer,
  rpc: client.rpc,
});
elapsed("proof generation");
logSigs(await client.sendTransactions(transferPlan));
elapsed("total incl. 5 transactions");

step("6. Recipient applies pending balance, both decrypt locally");
await applyPending(recipient);
const [sb, rb] = await Promise.all([balance(sender), balance(recipient)]);
console.log(`   sender    available ${ui(sb.availableBalance)}  pending ${ui(sb.pendingBalance)}`);
console.log(`   recipient available ${ui(rb.availableBalance)}  pending ${ui(rb.pendingBalance)}`);
elapsed();

step(`7. Recipient withdraws ${ui(WITHDRAW_AMOUNT)} to public balance`);
const withdrawPlan = await getConfidentialWithdrawInstructionPlan({
  token: recipient.token,
  mint,
  tokenAccount: (await fetchToken(client.rpc, recipient.token)).data,
  authority: recipient.signer,
  amount: WITHDRAW_AMOUNT,
  decimals: DECIMALS,
  elgamalKeypair: recipient.elgamalKeypair,
  aesKey: recipient.aesKey,
  payer,
  rpc: client.rpc,
});
logSigs(await client.sendTransactions(withdrawPlan));
const finalAcct = await fetchToken(client.rpc, recipient.token);
const finalCt = await balance(recipient);
console.log(`   recipient public ${ui(finalAcct.data.amount)}  confidential ${ui(finalCt.availableBalance)}`);
elapsed();

console.log(
  `\n✔ Done. The transfer transactions above carry only ciphertexts and proofs; the amount ${ui(SEND_AMOUNT)} does not appear on-chain.`,
);
