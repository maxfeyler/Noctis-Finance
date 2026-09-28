import {
  compileTransaction,
  getSignatureFromTransaction,
  getSignersFromTransactionMessage,
  getTransactionCodec,
  isTransactionPartialSigner,
  sendAndConfirmTransactionFactory,
  setTransactionMessageLifetimeUsingBlockhash,
  type Address,
  type InstructionPlanInput,
  type SignatureDictionary,
  type Transaction,
  type TransactionPlan,
} from "@solana/kit";
import type { NoctisClient } from "./client";
import type { OpContext } from "./operation";

/**
 * A wallet that signs a whole batch of transactions in one approval
 * (Wallet Standard `solana:signTransaction` with several inputs).
 */
export type BatchSigner = Readonly<{
  address: Address;
  signAll(transactions: readonly Transaction[]): Promise<Transaction[]>;
}>;

type SignFn = (
  ...inputs: readonly { transaction: Uint8Array }[]
) => Promise<readonly { signedTransaction: Uint8Array }[]>;

export function batchSignerFromWallet(address: Address, signTransactions: SignFn): BatchSigner {
  const codec = getTransactionCodec();
  return {
    address,
    async signAll(transactions) {
      if (transactions.length === 0) return [];
      const outputs = await signTransactions(
        ...transactions.map((t) => ({ transaction: new Uint8Array(codec.encode(t)) })),
      );
      return outputs.map((o, i) => {
        const decoded = codec.decode(o.signedTransaction);
        const lifetime = (transactions[i] as { lifetimeConstraint?: unknown }).lifetimeConstraint;
        return Object.freeze({ ...decoded, lifetimeConstraint: lifetime }) as Transaction;
      });
    },
  };
}

type Message = Extract<TransactionPlan, { kind: "single" }>["message"];

function flatten(plan: TransactionPlan, out: Message[] = []): Message[] {
  if (plan.kind === "single") out.push(plan.message);
  else plan.plans.forEach((p) => flatten(p, out));
  return out;
}

/**
 * Plans an instruction plan into transactions, asks the wallet to approve all
 * of them at once, adds the signatures of ephemeral signers (proof context
 * accounts), then sends and confirms them in order.
 *
 * The kit's default executor signs transaction by transaction, which means one
 * wallet popup per transaction: five for a confidential transfer.
 */
export async function executeBatched(
  client: NoctisClient,
  wallet: BatchSigner,
  plan: InstructionPlanInput,
  ctx: OpContext,
): Promise<string[]> {
  const messages = flatten(await client.planTransactions(plan));
  const total = messages.length;
  const { value: blockhash } = await client.rpc.getLatestBlockhash({ commitment: "confirmed" }).send();
  const withLifetime = messages.map((m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m));
  const compiled = withLifetime.map((m) => compileTransaction(m) as Transaction);

  ctx.step("sign", total > 1 ? `${total} transactions, one approval` : "1 transaction");
  const walletSigned = await wallet.signAll(compiled);

  // Modifying signers (the wallet) sign first, partial signers afterwards,
  // so ephemeral keys sign the exact bytes the wallet approved.
  const ready = await Promise.all(
    walletSigned.map(async (tx, i) => {
      const others = getSignersFromTransactionMessage(withLifetime[i] as Parameters<typeof getSignersFromTransactionMessage>[0])
        .filter((s) => s.address !== wallet.address)
        .filter(isTransactionPartialSigner);
      const signatures: Record<string, SignatureDictionary[Address] | null> = { ...tx.signatures };
      for (const s of others) {
        const [dict] = await s.signTransactions([tx as Parameters<typeof s.signTransactions>[0][number]]);
        Object.assign(signatures, dict);
      }
      return Object.freeze({ ...tx, signatures: Object.freeze(signatures) }) as Transaction;
    }),
  );

  const send = sendAndConfirmTransactionFactory({ rpc: client.rpc, rpcSubscriptions: client.rpcSubscriptions });
  ctx.step("confirm", `0 / ${total}`);
  const sigs: string[] = [];
  for (const [i, tx] of ready.entries()) {
    await send(tx as Parameters<typeof send>[0], { commitment: "confirmed" });
    const sig = getSignatureFromTransaction(tx);
    sigs.push(sig);
    ctx.signature(sig);
    ctx.detail("confirm", `${i + 1} / ${total}`);
  }
  return sigs;
}
