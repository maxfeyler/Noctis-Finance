import { generateKeyPairSigner, type Address, type TransactionSigner } from "@solana/kit";
import {
  TOKEN_2022_PROGRAM_ADDRESS,
  extension,
  fetchMaybeToken,
  fetchMint,
  fetchToken,
  findAssociatedTokenPda,
  getApplyConfidentialPendingBalanceInstruction,
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
import { executeBatched, type BatchSigner } from "./batch";
import type { OpContext } from "./operation";

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
  const configured = isConfigured(data);
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

/** True when a decoded token account carries the ConfidentialTransferAccount extension. */
export function isConfigured(t: Token) {
  return t.extensions.__option === "Some" && t.extensions.value.some((e) => e.__kind === "ConfidentialTransferAccount");
}

export type RecipientStatus = "ready" | "not-activated" | "no-account";

/** Whether `owner` can receive confidential transfers of `mint`. */
export async function recipientStatus(client: NoctisClient, owner: Address, mint: Address): Promise<RecipientStatus> {
  const acct = await fetchMaybeToken(client.rpc, await tokenAddress(owner, mint));
  if (!acct.exists) return "no-account";
  return isConfigured(acct.data) ? "ready" : "not-activated";
}

type Ctx = { client: NoctisClient; wallet: BatchSigner; owner: TransactionSigner; op: OpContext };

/** Dev helper: a fresh Token-2022 mint with the confidential extension, authority = wallet. */
export async function createDemoMint({ client, wallet, owner, op }: Ctx, decimals = 2) {
  const newMint = await generateKeyPairSigner();
  const plan = await getCreateMintInstructionPlan(client, {
    payer: client.payer,
    newMint,
    decimals,
    mintAuthority: owner,
    extensions: [
      extension("ConfidentialTransferMint", {
        authority: owner.address,
        autoApproveNewAccounts: true,
        auditorElgamalPubkey: null,
      }),
    ],
  });
  await executeBatched(client, wallet, plan, op);
  return newMint.address;
}

/** Dev helper: mint public tokens to the wallet's own token account (wallet must be mint authority). */
export async function mintDemoTokens({ client, wallet, owner, op }: Ctx, mint: Address, token: Address, amount: bigint) {
  await executeBatched(client, wallet, [getMintToInstruction({ mint, token, mintAuthority: owner, amount })], op);
}

export async function activate({ client, wallet, owner, op }: Ctx, keys: ConfidentialKeys) {
  op.step("prepare", "Public-key validity proof");
  const plan = await getCreateConfidentialTransferAccountInstructionPlan({
    payer: client.payer,
    owner,
    mint: keys.mint,
    rpc: client.rpc,
    elgamalKeypair: keys.elgamalKeypair,
    aesKey: keys.aesKey,
  });
  await executeBatched(client, wallet, plan, op);
}

/**
 * Deposit public tokens and make them spendable in a single transaction.
 *
 * `ApplyPendingBalance` normally needs the post-deposit account state, but its
 * inputs are predictable: the credit counter goes up by exactly one and the
 * new available balance is available + pending + amount, which we encrypt
 * locally with the AES key.
 */
export async function depositAndApply({ client, wallet, owner, op }: Ctx, keys: ConfidentialKeys, token: Address, amount: bigint, decimals: number) {
  op.step("prepare", "Computing the new encrypted balance");
  const acct = await fetchToken(client.rpc, token);
  const b = decryptConfidentialTransferBalance({
    tokenAccount: acct.data,
    elgamalSecretKey: keys.elgamalKeypair.secret(),
    aesKey: keys.aesKey,
  });
  const newAvailable = b.availableBalance + b.pendingBalance + amount;
  await executeBatched(client, wallet, [
    getConfidentialDepositInstruction({ token, mint: keys.mint, authority: owner, amount, decimals }),
    getApplyConfidentialPendingBalanceInstruction({
      token,
      authority: owner,
      expectedPendingBalanceCreditCounter: b.pendingBalanceCreditCounter + 1n,
      newDecryptableAvailableBalance: keys.aesKey.encrypt(newAvailable).toBytes(),
    }),
  ], op);
}

export async function applyPending({ client, wallet, owner, op }: Ctx, keys: ConfidentialKeys, token: Address) {
  op.step("prepare", "Re-encrypting the available balance");
  const acct = await fetchToken(client.rpc, token);
  const ix = getApplyConfidentialPendingBalanceInstructionFromToken({
    token,
    tokenAccount: acct.data,
    authority: owner,
    elgamalSecretKey: keys.elgamalKeypair.secret(),
    aesKey: keys.aesKey,
  });
  await executeBatched(client, wallet, [ix], op);
}

export async function transfer({ client, wallet, owner, op }: Ctx, keys: ConfidentialKeys, sourceToken: Address, recipientOwner: Address, amount: bigint) {
  op.step("prepare", "Checking the recipient");
  const destinationToken = await tokenAddress(recipientOwner, keys.mint);
  const [src, dst] = await Promise.all([
    fetchToken(client.rpc, sourceToken),
    fetchMaybeToken(client.rpc, destinationToken),
  ]);
  if (!dst.exists || !isConfigured(dst.data)) {
    throw new Error("The recipient has not activated a confidential balance for this token yet.");
  }
  op.detail("prepare", "Equality, validity and range proofs");
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
  op.detail("prepare", `Proofs ready in ${proofMs} ms`);
  await executeBatched(client, wallet, plan, op);
  return { proofMs };
}

export async function withdraw({ client, wallet, owner, op }: Ctx, keys: ConfidentialKeys, token: Address, amount: bigint, decimals: number) {
  op.step("prepare", "Equality and range proofs");
  const acct = await fetchToken(client.rpc, token);
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
  await executeBatched(client, wallet, plan, op);
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
