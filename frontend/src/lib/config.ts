export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? "https://api.devnet.solana.com";
export const WS_URL =
  process.env.NEXT_PUBLIC_WS_URL ?? RPC_URL.replace(/^http/, "ws").replace(":8899", ":8900");
/** Optional default mint (a Token-2022 mint with the ConfidentialTransfer extension). */
export const DEFAULT_MINT = process.env.NEXT_PUBLIC_MINT ?? "";

export type Cluster = "mainnet" | "devnet" | "testnet" | "localnet";
export const CLUSTER: Cluster = /mainnet/.test(RPC_URL)
  ? "mainnet"
  : /devnet/.test(RPC_URL)
    ? "devnet"
    : /testnet/.test(RPC_URL)
      ? "testnet"
      : "localnet";

/** Wallet-standard chain identifier the wallet must support. */
export const CHAIN = `solana:${CLUSTER}` as const;

export function explorerTx(sig: string) {
  if (CLUSTER === "localnet") return `https://explorer.solana.com/tx/${sig}?cluster=custom&customUrl=${encodeURIComponent(RPC_URL)}`;
  return `https://explorer.solana.com/tx/${sig}${CLUSTER === "mainnet" ? "" : `?cluster=${CLUSTER}`}`;
}
export function explorerAddress(addr: string) {
  if (CLUSTER === "localnet") return `https://explorer.solana.com/address/${addr}?cluster=custom&customUrl=${encodeURIComponent(RPC_URL)}`;
  return `https://explorer.solana.com/address/${addr}${CLUSTER === "mainnet" ? "" : `?cluster=${CLUSTER}`}`;
}
