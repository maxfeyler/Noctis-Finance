export function short(addr: string, n = 4) {
  return addr.length <= n * 2 + 1 ? addr : `${addr.slice(0, n)}…${addr.slice(-n)}`;
}
export function toUi(base: bigint | number, decimals: number) {
  const b = BigInt(base);
  const neg = b < 0n;
  const abs = neg ? -b : b;
  const s = abs.toString().padStart(decimals + 1, "0");
  const int = s.slice(0, s.length - decimals) || "0";
  const frac = decimals ? s.slice(s.length - decimals) : "";
  return `${neg ? "-" : ""}${int.replace(/\B(?=(\d{3})+(?!\d))/g, " ")}${decimals ? "." + frac : ""}`;
}
export function toBase(ui: string, decimals: number): bigint {
  const clean = ui.trim().replace(",", ".");
  if (!/^\d*(\.\d*)?$/.test(clean) || clean === "" || clean === ".") throw new Error("Enter a valid amount");
  const [int = "0", frac = ""] = clean.split(".");
  if (frac.length > decimals) throw new Error(`At most ${decimals} decimals`);
  return BigInt(int + frac.padEnd(decimals, "0"));
}
function rawMessage(e: unknown): string {
  if (e instanceof Error) {
    // Kit errors wrap the useful message in `context.causeMessage` or in cause chains.
    const ctx = (e as { context?: { causeMessage?: string } }).context;
    if (ctx?.causeMessage) return ctx.causeMessage.split("\n")[0].trim();
    if (e.cause instanceof Error) return rawMessage(e.cause) || e.message;
    return e.message;
  }
  return String(e);
}

const FRIENDLY: [RegExp, string][] = [
  [/user rejected|rejected the request|declined|cancel+ed|4001/i, "You declined the request in your wallet. Nothing was sent."],
  [/block height exceeded|blockhash not found|expired/i, "The approval took too long and the transactions expired. Try again, and approve within a minute."],
  [/attempt to debit an account but found no record|insufficient lamports|insufficient funds for (fee|rent)/i, "Not enough SOL for fees and proof-account rent. Add a little SOL to this wallet."],
  [/0x1\b|insufficientfunds|insufficient funds/i, "Insufficient balance for this amount."],
  [/proof_verification failed|invalid instruction data/i, "The on-chain proof check failed. Refresh your balance and try again."],
  [/walletmultisign|multisign_unimplemented/i, "This wallet cannot approve several transactions at once."],
];

/** A one-sentence message a person can act on. */
export function errorMessage(e: unknown): string {
  const raw = rawMessage(e);
  for (const [re, msg] of FRIENDLY) if (re.test(raw)) return msg;
  return raw.length > 180 ? raw.slice(0, 177) + "…" : raw;
}
