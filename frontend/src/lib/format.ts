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
export function errorMessage(e: unknown): string {
  if (e instanceof Error) {
    // Kit errors wrap the useful message in `context.causeMessage` or in cause chains.
    const ctx = (e as { context?: { causeMessage?: string } }).context;
    if (ctx?.causeMessage) return ctx.causeMessage.split("\n")[0].trim();
    if (e.cause instanceof Error) return errorMessage(e.cause);
    return e.message;
  }
  return String(e);
}
