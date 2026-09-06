import { generateKeyPairSigner, type Address, type InstructionPlanInput, type Signature, type TransactionSigner } from "@solana/kit";
import {
  TOKEN_2022_PROGRAM_ADDRESS,
  extension,
  fetchMaybeToken,
  fetchMint,
  fetchToken,
  findAssociatedTokenPda,
  getConfidentialDepositInstruction,
  getCreateMintInstructionPlan,
  getMintToInstruction,
  type Mint,
  type Token,
} from "@solana-program/token-2022";
import {
  decryptConfidentialTransferBalance,
  getApplyConfidentialPendingBalanceInstructionFromToken,
  getConfidentialTransferInstructionPlan,
  getConfidentialWithdrawInstructionPlan,
  getCreateConfidentialTransferAccountInstructionPlan,
} from "@solana-program/token-2022/confidential";
import type { NoctisClient } from "./client";
import type { ConfidentialKeys } from "./keys";

export type AccountState = Readonly<{
  token: Address;
  exists: boolean;
  configured: boolean;
  publicAmount: bigint;
  /** Decrypted balances, only when keys are available and the account is configured. */
  confidential?: { available: bigint; pending: bigint; pendingCredits: bigint };
  raw?: Token;
}>;

export async function tokenAddress(owner: Address, mint: Address) {
  const [token] = await findAssociatedTokenPda({ owner, mint, tokenProgram: TOKEN_2022_PROGRAM_ADDRESS });
  return token;
}

export async function loadMint(client: NoctisClient, mint: Address): Promise<Mint> {
  return (await fetchMint(client.rpc, mint)).data;
}

export function mintHasConfidentialExtension(mint: Mint) {
  return mint.extensions.__option === "Some" &&
    mint.extensions.value.some((e) => e.__kind === "ConfidentialTransferMint");
}

export async function loadAccountState(
  client: NoctisClient,
  owner: Address,
  mint: Address,
  keys?: ConfidentialKeys,
): Promise<AccountState> {
  const token = await tokenAddress(owner, mint);
  const acct = await fetchMaybeToken(client.rpc, token);
  if (!acct.exists) return { token, exists: false, configured: false, publicAmount: 0n };
  const data = acct.data;
  const configured =
    data.extensions.__option === "Some" &&
    data.extensions.value.some((e) => e.__kind === "ConfidentialTransferAccount");
  const state: AccountState = { token, exists: true, configured, publicAmount: data.amount, raw: data };
  if (configured && keys) {
    const b = decryptConfidentialTransferBalance({
      tokenAccount: data,
      elgamalSecretKey: keys.elgamalKeypair.secret(),
      aesKey: keys.aesKey,
    });
    return {
      ...state,
      confidential: { available: b.availableBalance, pending: b.pendingBalance, pendingCredits: b.pendingBalanceCreditCounter },
    };
  }
  return state;
}

export type Progress = (msg: string) => void;

function sigs(result: unknown, out: Signature[] = []): Signature[] {
  if (Array.isArray(result)) result.forEach((r) => sigs(r, out));
  else if (result && typeof result === "object") {
    for (const [k, v] of Object.entries(result as Record<string, unknown>)) {
      if (k === "signature" && typeof v === "string") out.push(v as Signature);
      else if (v && typeof v === "object") sigs(v, out);
    }
  }
  return out;
}

/** Plans, reports the number of transactions to sign, executes, returns signatures. */
async function run(client: NoctisClient, plan: InstructionPlanInput, progress?: Progress) {
  const txPlan = await client.planTransactions(plan);
  const count = countSingles(txPlan);
  progress?.(count > 1 ? `Sign ${count} transactions in your wallet` : "Sign the transaction in your wallet");
  const result = await client.sendTransactions(plan);
  return sigs(result);
}
function countSingles(plan: unknown): number {
  if (!plan || typeof plan !== "object") return 0;
  const p = plan as { kind?: string; plans?: unknown[] };
  if (p.kind === "single") return 1;
  return (p.plans ?? []).reduce<number>((n, x) => n + countSingles(x), 0);
}

/** Dev helper: a fresh Token-2022 mint with the confidential extension, authority = wallet. */
export async function createDemoMint(client: NoctisClient, authority: TransactionSigner, decimals = 2, progress?: Progress) {
  const newMint = await generateKeyPairSigner();
  const plan = await getCreateMintInstructionPlan(client, {
    payer: client.payer,
    newMint,
    decimals,
    mintAuthority: authority,
    extensions: [
      extension("ConfidentialTransferMint", {
        authority: authority.address,
        autoApproveNewAccounts: true,
        auditorElgamalPubkey: null,
      }),
    ],
  });
  const s = await run(client, plan, progress);
  return { mint: newMint.address, signatures: s };
}

/** Dev helper: mint public tokens to the wallet's own token account (wallet must be mint authority). */
export async function mintDemoTokens(client: NoctisClient, authority: TransactionSigner, mint: Address, token: Address, amount: bigint, progress?: Progress) {
  progress?.("Sign the transaction in your wallet");
  const r = await client.sendTransaction([getMintToInstruction({ mint, token, mintAuthority: authority, amount })]);
  return sigs(r);
}

export async function activate(client: NoctisClient, owner: TransactionSigner, keys: ConfidentialKeys, progress?: Progress) {
  const plan = await getCreateConfidentialTransferAccountInstructionPlan({
    payer: client.payer,
    owner,
    mint: keys.mint,
    rpc: client.rpc,
    elgamalKeypair: keys.elgamalKeypair,
    aesKey: keys.aesKey,
  });
  return run(client, plan, progress);
}

export async function deposit(client: NoctisClient, owner: TransactionSigner, token: Address, mint: Address, amount: bigint, decimals: number, progress?: Progress) {
  progress?.("Sign the transaction in your wallet");
  const r = await client.sendTransaction([
    getConfidentialDepositInstruction({ token, mint, authority: owner, amount, decimals }),
  ]);
  return sigs(r);
}

export async function applyPending(client: NoctisClient, owner: TransactionSigner, token: Address, keys: ConfidentialKeys, progress?: Progress) {
  const acct = await fetchToken(client.rpc, token);
  const ix = getApplyConfidentialPendingBalanceInstructionFromToken({
    token,
    tokenAccount: acct.data,
    authority: owner,
    elgamalSecretKey: keys.elgamalKeypair.secret(),
    aesKey: keys.aesKey,
  });
  progress?.("Sign the transaction in your wallet");
  const r = await client.sendTransaction([ix]);
  return sigs(r);
}

export async function transfer(
  client: NoctisClient,
  owner: TransactionSigner,
  keys: ConfidentialKeys,
  sourceToken: Address,
  recipientOwner: Address,
  amount: bigint,
  progress?: Progress,
) {
  const destinationToken = await tokenAddress(recipientOwner, keys.mint);
  const [src, dst] = await Promise.all([
    fetchToken(client.rpc, sourceToken),
    fetchMaybeToken(client.rpc, destinationToken),
  ]);
  if (!dst.exists) throw new Error("The recipient has not activated a confidential account for this token yet.");
  const dstConfigured =
    dst.data.extensions.__option === "Some" &&
    dst.data.extensions.value.some((e) => e.__kind === "ConfidentialTransferAccount");
  if (!dstConfigured) throw new Error("The recipient's token account is not configured for confidential transfers.");

  progress?.("Encrypting amount and generating proofs…");
  const t = performance.now();
  const plan = await getConfidentialTransferInstructionPlan({
    sourceToken,
    mint: keys.mint,
    destinationToken,
    sourceTokenAccount: src.data,
    destinationTokenAccount: dst.data,
    authority: owner,
    amount,
    sourceElgamalKeypair: keys.elgamalKeypair,
    aesKey: keys.aesKey,
    payer: client.payer,
    rpc: client.rpc,
  });
  const proofMs = Math.round(performance.now() - t);
  const signatures = await run(client, plan, progress);
  return { signatures, proofMs, destinationToken };
}

export async function withdraw(client: NoctisClient, owner: TransactionSigner, keys: ConfidentialKeys, token: Address, amount: bigint, decimals: number, progress?: Progress) {
  const acct = await fetchToken(client.rpc, token);
  progress?.("Generating range proof…");
  const plan = await getConfidentialWithdrawInstructionPlan({
    token,
    mint: keys.mint,
    tokenAccount: acct.data,
    authority: owner,
    amount,
    decimals,
    elgamalKeypair: keys.elgamalKeypair,
    aesKey: keys.aesKey,
    payer: client.payer,
    rpc: client.rpc,
  });
  return run(client, plan, progress);
}

export type ActivityItem = { signature: string; time: number | null; kinds: string[]; ok: boolean };

/** Recent transactions touching the token account, with the Token-2022 instruction types. */
export async function loadActivity(client: NoctisClient, token: Address, limit = 12): Promise<ActivityItem[]> {
  const list = await client.rpc.getSignaturesForAddress(token, { limit }).send();
  const items = await Promise.all(
    list.map(async (s) => {
      const tx = await client.rpc
        .getTransaction(s.signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 })
        .send();
      const kinds: string[] = [];
      const ixs = (tx?.transaction.message.instructions ?? []) as unknown as ReadonlyArray<{
        programId: string;
        parsed?: { type?: string } | string;
      }>;
      for (const ix of ixs) {
        if (ix.programId !== TOKEN_2022_PROGRAM_ADDRESS) continue;
        const p = ix.parsed;
        kinds.push(typeof p === "object" && p?.type ? p.type : "token-2022");
      }
      return { signature: s.signature, time: s.blockTime ? Number(s.blockTime) * 1000 : null, kinds, ok: s.err === null };
    }),
  );
  return items;
}

export function humanKind(kind: string) {
  const map: Record<string, string> = {
    configureConfidentialTransferAccount: "Activated confidential account",
    confidentialTransfer: "Confidential transfer",
    confidentialTransferWithFee: "Confidential transfer",
    depositConfidentialTransfer: "Deposit to confidential balance",
    confidentialDeposit: "Deposit to confidential balance",
    withdrawConfidentialTransfer: "Withdraw to public balance",
    confidentialWithdraw: "Withdraw to public balance",
    applyPendingConfidentialTransferBalance: "Applied pending balance",
    applyConfidentialPendingBalance: "Applied pending balance",
    mintTo: "Minted",
    mintToChecked: "Minted",
    reallocate: "Account resized",
    initializeAccount3: "Account created",
    initializeImmutableOwner: "Account created",
  };
  return map[kind] ?? kind.replace(/([A-Z])/g, " $1").toLowerCase().replace(/^./, (c) => c.toUpperCase());
}
