"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { toBase, toUi } from "@/lib/format";
import type { AccountState } from "@/lib/ct";

type Tab = "send" | "receive" | "deposit" | "withdraw";
type Props = {
  owner: string;
  mint: string;
  state: AccountState | null;
  decimals: number;
  symbol: string;
  ready: boolean; // keys derived (actions derive them on demand otherwise)
  busy: boolean;
  onSend: (to: string, amount: bigint) => void;
  onDeposit: (amount: bigint) => void;
  onWithdraw: (amount: bigint) => void;
};

export function Actions({ owner, mint, state, decimals, symbol, ready, busy, onSend, onDeposit, onWithdraw }: Props) {
  const [tab, setTab] = useState<Tab>("send");
  const [to, setTo] = useState("");
  const [amt, setAmt] = useState("");

  const parse = () => {
    try { return toBase(amt, decimals); } catch (e) { toast.error((e as Error).message); return null; }
  };
  const copy = (t: string) => { navigator.clipboard.writeText(t); toast.success("Copied"); };
  // Actions that need the keys derive them on demand (wallet signature), so
  // only an unconfigured account blocks them.
  const disabled = busy || !state?.configured;
  const unlockHint = !ready && state?.configured ? " · unlocks first" : "";

  return (
    <section className="card p-6">
      <div className="tabs mb-5" role="tablist">
        {(["send", "receive", "deposit", "withdraw"] as Tab[]).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className="tab" onClick={() => setTab(t)}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === "send" && (
        <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); const a = parse(); if (a !== null) onSend(to.trim(), a); }}>
          <div>
            <label className="lbl" htmlFor="to">Recipient wallet address</label>
            <input id="to" className="field" placeholder="Their Solana address" value={to} onChange={(e) => setTo(e.target.value)} autoComplete="off" spellCheck={false} />
            <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>They must have activated a confidential balance for this token.</p>
          </div>
          <div>
            <label className="lbl" htmlFor="amt">Amount</label>
            <div className="flex gap-2">
              <input id="amt" className="field" placeholder="0.00" inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} />
              <button type="button" className="btn btn-sm self-center" disabled={!state?.confidential} onClick={() => state?.confidential && setAmt(toUi(state.confidential.available, decimals).replace(/\s/g, ""))}>Max</button>
            </div>
          </div>
          <button className="btn btn-primary" type="submit" disabled={disabled || !to || !amt}>Send confidentially{unlockHint}</button>
          <p className="text-xs" style={{ color: "var(--muted)", maxWidth: "50ch" }}>
            The amount is encrypted for the recipient; three zero-knowledge proofs are generated here and verified on-chain. Five transactions to sign.
          </p>
        </form>
      )}

      {tab === "receive" && (
        <div className="flex gap-6 items-start flex-wrap">
          <div className="p-3 rounded-lg" style={{ background: "#fff" }}>
            <QRCodeSVG value={owner} size={148} bgColor="#ffffff" fgColor="#15171d" />
          </div>
          <div className="flex-1 min-w-[240px]">
            <div className="eyebrow mb-1">Your wallet address</div>
            <div className="mono text-sm break-all">{owner}</div>
            <button className="btn btn-sm mt-2" onClick={() => copy(owner)}><Copy size={13} /> Copy</button>
            <div className="eyebrow mt-5 mb-1">Token (mint)</div>
            <div className="mono text-xs break-all" style={{ color: "var(--ink-2)" }}>{mint}</div>
            <p className="text-xs mt-4" style={{ color: "var(--muted)", maxWidth: "40ch" }}>
              Incoming confidential transfers land in your pending balance. Apply them to make them spendable.
            </p>
          </div>
        </div>
      )}

      {tab === "deposit" && (
        <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); const a = parse(); if (a !== null) onDeposit(a); }}>
          <p className="text-sm" style={{ color: "var(--ink-2)", maxWidth: "50ch" }}>
            Move public tokens into your confidential balance. This step is visible on-chain; everything after it is not.
          </p>
          <div>
            <label className="lbl" htmlFor="dep">Amount · public balance {state ? toUi(state.publicAmount, decimals) : "…"} {symbol}</label>
            <input id="dep" className="field" placeholder="0.00" inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} />
          </div>
          <button className="btn btn-primary" type="submit" disabled={busy || !state?.configured || !amt}>Deposit</button>
        </form>
      )}

      {tab === "withdraw" && (
        <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); const a = parse(); if (a !== null) onWithdraw(a); }}>
          <p className="text-sm" style={{ color: "var(--ink-2)", maxWidth: "50ch" }}>
            Move confidential tokens back to your public balance, with a range proof. The withdrawn amount becomes visible.
          </p>
          <div>
            <label className="lbl" htmlFor="wd">Amount · available {state?.confidential ? toUi(state.confidential.available, decimals) : "…"} {symbol}</label>
            <input id="wd" className="field" placeholder="0.00" inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} />
          </div>
          <button className="btn btn-primary" type="submit" disabled={disabled || !amt}>Withdraw{unlockHint}</button>
        </form>
      )}
    </section>
  );
}
