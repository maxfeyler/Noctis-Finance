import { createClient, type TransactionSigner } from "@solana/kit";
import { solanaRpc } from "@solana/kit-plugin-rpc";
import { RPC_URL, WS_URL } from "./config";

/**
 * Kit client whose fee payer is the connected wallet. Resource-limit
 * estimation is disabled on purpose: the confidential-transfer helpers put the
 * range proof inline, and that transaction has no room for a compute-budget
 * instruction.
 */
export function createNoctisClient(payer: TransactionSigner) {
  return createClient()
    .use((c) => ({ ...c, payer }))
    .use(
      solanaRpc({
        rpcUrl: RPC_URL,
        rpcSubscriptionsUrl: WS_URL,
        transactionConfig: { estimateResourceLimits: false },
      }),
    );
}
export type NoctisClient = ReturnType<typeof createNoctisClient>;
