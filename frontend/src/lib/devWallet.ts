/**
 * In-page burner wallet registered through the Wallet Standard.
 *
 * Enabled only when NEXT_PUBLIC_DEV_WALLET=1. It lets the whole confidential
 * flow run on localnet or devnet without a browser extension: the key lives in
 * localStorage, is shown as "Noctis Dev Wallet" in the connect menu, and must
 * never hold real funds.
 */
import {
  createKeyPairFromPrivateKeyBytes,
  getAddressFromPublicKey,
  getTransactionDecoder,
  getTransactionEncoder,
  partiallySignTransaction,
  signBytes,
  type Address,
} from "@solana/kit";
import { registerWallet } from "@wallet-standard/wallet";
import type { Wallet, WalletAccount } from "@wallet-standard/base";
import type { StandardEventsListeners } from "@wallet-standard/features";
import type { SolanaSignMessageInput, SolanaSignTransactionInput } from "@solana/wallet-standard-features";
import { CHAIN, CLUSTER, RPC_URL } from "./config";

const STORAGE_KEY = "noctis:dev-wallet-secret";
const ICON =
  "data:image/svg+xml;base64," +
  btoa(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="#d9b96a"/><circle cx="22" cy="11" r="12" fill="#131725"/></svg>`,
  );

function loadOrCreateSecret(): Uint8Array {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return Uint8Array.from(JSON.parse(raw) as number[]);
  } catch {}
  const secret = crypto.getRandomValues(new Uint8Array(32));
  return secret;
}

async function airdropIfLocal(address: Address) {
  if (CLUSTER !== "localnet") return;
  try {
    await fetch(RPC_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "requestAirdrop", params: [address, 5_000_000_000] }),
    });
  } catch {}
}

export async function registerDevWallet() {
  if (typeof window === "undefined") return;
  if ((window as unknown as { __noctisDevWallet?: boolean }).__noctisDevWallet) return;
  (window as unknown as { __noctisDevWallet?: boolean }).__noctisDevWallet = true;

  const seed = loadOrCreateSecret();
  const keyPair = await createKeyPairFromPrivateKeyBytes(seed, true);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(seed))); } catch {}

  const address = await getAddressFromPublicKey(keyPair.publicKey);
  const publicKey = new Uint8Array(await crypto.subtle.exportKey("raw", keyPair.publicKey));

  const account: WalletAccount = {
    address,
    publicKey,
    chains: [CHAIN],
    features: ["solana:signTransaction", "solana:signMessage"],
    label: "Dev wallet (burner)",
  };

  let connected: readonly WalletAccount[] = [];
  const listeners = new Set<StandardEventsListeners["change"]>();
  const emit = () => listeners.forEach((l) => l({ accounts: connected }));

  const wallet: Wallet = {
    version: "1.0.0",
    name: "Noctis Dev Wallet",
    icon: ICON as Wallet["icon"],
    chains: [CHAIN],
    get accounts() { return connected; },
    features: {
      "standard:connect": {
        version: "1.0.0",
        connect: async () => {
          if (connected.length === 0) {
            connected = [account];
            void airdropIfLocal(address);
            emit();
          }
          return { accounts: connected };
        },
      },
      "standard:disconnect": {
        version: "1.0.0",
        disconnect: async () => { connected = []; emit(); },
      },
      "standard:events": {
        version: "1.0.0",
        on: (event: "change", listener: StandardEventsListeners["change"]) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      },
      "solana:signTransaction": {
        version: "1.0.0",
        supportedTransactionVersions: ["legacy", 0],
        signTransaction: async (...inputs: readonly SolanaSignTransactionInput[]) => {
          const dec = getTransactionDecoder();
          const enc = getTransactionEncoder();
          const out = [];
          for (const i of inputs) {
            const tx = dec.decode(i.transaction);
            const signed = await partiallySignTransaction([keyPair], tx);
            out.push({ signedTransaction: new Uint8Array(enc.encode(signed)) });
          }
          return out;
        },
      },
      "solana:signMessage": {
        version: "1.0.0",
        signMessage: async (...inputs: readonly SolanaSignMessageInput[]) => {
          const out = [];
          for (const i of inputs) {
            const signature = await signBytes(keyPair.privateKey, i.message);
            out.push({ signedMessage: i.message, signature: new Uint8Array(signature), signatureType: "ed25519" as const });
          }
          return out;
        },
      },
    },
  };
  registerWallet(wallet);
}
