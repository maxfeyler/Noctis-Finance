/**
 * Manage the CLI wallet's confidential account for a given mint.
 *
 *   npm run account -- setup   <mint>   configure a confidential token account (idempotent)
 *   npm run account -- balance <mint>   decrypt and print balances
 *   npm run account -- apply   <mint>   apply the pending balance
 *
 * Env: RPC_URL (default localnet), KEYPAIR (default ~/.config/solana/id.json)
 */
import { homedir } from "node:os";
import { join } from "node:path";
import { address, createClient } from "@solana/kit";
import { solanaRpc } from "@solana/kit-plugin-rpc";
import { signerFromFile } from "@solana/kit-plugin-signer";
import { TOKEN_2022_PROGRAM_ADDRESS, fetchMaybeToken, fetchMint, fetchToken, findAssociatedTokenPda } from "@solana-program/token-2022";
import {
  deriveAeKeyForOwnerMint,
  deriveElGamalKeypairForOwnerMint,
  fetchConfidentialTransferBalance,
  getApplyConfidentialPendingBalanceInstructionFromToken,
  getCreateConfidentialTransferAccountInstructionPlan,
} from "@solana-program/token-2022/confidential";
import { AeKey, ElGamalKeypair, ElGamalSecretKey } from "@solana/zk-sdk";

const [cmd, mintArg] = process.argv.slice(2);
if (!cmd || !mintArg || !["setup", "balance", "apply"].includes(cmd)) {
  console.error("usage: account.ts <setup|balance|apply> <mint>");
  process.exit(1);
}
const RPC_URL = process.env.RPC_URL ?? "http://127.0.0.1:8899";
const KEYPAIR = process.env.KEYPAIR ?? join(homedir(), ".config/solana/id.json");
const mint = address(mintArg);

const client = await createClient()
  .use(signerFromFile(KEYPAIR))
  .use(solanaRpc({ rpcUrl: RPC_URL, transactionConfig: { estimateResourceLimits: false } }));
const owner = client.payer;
const [token] = await findAssociatedTokenPda({ owner: owner.address, mint, tokenProgram: TOKEN_2022_PROGRAM_ADDRESS });
const decimals = (await fetchMint(client.rpc, mint)).data.decimals;
const ui = (b: bigint) => (Number(b) / 10 ** decimals).toFixed(decimals);

const eg = await deriveElGamalKeypairForOwnerMint({ signer: owner, owner: owner.address, mint });
const ae = await deriveAeKeyForOwnerMint({ signer: owner, owner: owner.address, mint });
const elgamalKeypair = ElGamalKeypair.fromSecretKey(ElGamalSecretKey.fromBytes(eg.secretKey));
const aesKey = AeKey.fromBytes(ae);

console.log(`owner ${owner.address}\ntoken ${token}`);

if (cmd === "setup") {
  const existing = await fetchMaybeToken(client.rpc, token);
  const configured = existing.exists && existing.data.extensions.__option === "Some" &&
    existing.data.extensions.value.some((e) => e.__kind === "ConfidentialTransferAccount");
  if (configured) { console.log("already configured"); process.exit(0); }
  const plan = await getCreateConfidentialTransferAccountInstructionPlan({
    payer: owner, owner, mint, rpc: client.rpc, elgamalKeypair, aesKey,
  });
  await client.sendTransactions(plan);
  console.log("configured ✔");
}
if (cmd === "apply") {
  const acct = await fetchToken(client.rpc, token);
  const ix = getApplyConfidentialPendingBalanceInstructionFromToken({
    token, tokenAccount: acct.data, authority: owner, elgamalSecretKey: elgamalKeypair.secret(), aesKey,
  });
  await client.sendTransaction([ix]);
  console.log("applied ✔");
}
const b = await fetchConfidentialTransferBalance({ token, rpc: client.rpc, elgamalSecretKey: elgamalKeypair.secret(), aesKey });
const acct = await fetchToken(client.rpc, token);
console.log(`public ${ui(acct.data.amount)}  pending ${ui(b.pendingBalance)}  available ${ui(b.availableBalance)}`);
