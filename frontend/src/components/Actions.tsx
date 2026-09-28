"use client";

import { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { AlertCircle, CheckCircle2, Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { isAddress } from "@solana/kit";
import { toBase, toUi } from "@/lib/format";
import type { AccountState, RecipientStatus } from "@/lib/ct";

type Tab = "send" | "receive" | "deposit" | "withdraw";
type Props = {
  owner: string;
  mint: string;
  state: AccountState | null;
  decimals: number;
  symbol: string;
  unlocked: boolean;
  busy: boolean;
  checkRecipient: (address: string) => Promise<RecipientStatus>;
  onSend: (to: string, amount: bigint) => void;
  onDeposit: (amount: bigint) => void;
  onWithdraw: (amount: bigint) => void;
};

/** Parses an amount and checks it against a limit; returns an error to show inline. */
function useAmount(raw: string, decimals: number, limit: bigint | undefined, limitLabel: string) {
  return useMemo(() => {
    if (!raw.trim()) return { value: null as bigint | null, error: null as string | null };
    try {
      const v = toBase(raw, decimals);
      if (v === 0n) return { value: null, error: "Enter an amount above zero" };
      if (limit !== undefined && v > limit) return { value: null, error: `More than your ${limitLabel} (${toUi(limit, decimals)})` };
      return { value: v, error: null };
    } catch (e) {
      return { value: null, error: (e as Error).message };
    }
  }, [raw, decimals, limit, limitLabel]);
}

const RECIPIENT_TEXT: Record<RecipientStatus | "self" | "invalid" | "checking", { cls: string; text: string }> = {
  ready: { cls: "hint-ok", text: "Ready to receive confidential transfers" },
  "not-activated": { cls: "hint-warn", text: "Has a token account but no confidential balance yet. Ask them to activate it in Noctis." },
  "no-account": { cls: "hint-warn", text: "Has never held this token. Ask them to open Noctis and activate a confidential balance." },
  self: { cls: "hint-warn", text: "That is your own address" },
  invalid: { cls: "hint-warn", text: "Not a valid Solana address" },
  checking: { cls: "hint-muted", text: "Checking recipient…" },
};

export function Actions(p: Props) {
  const { owner, mint, state, decimals, symbol, unlocked, busy } = p;
  const [tab, setTab] = useState<Tab>("send");
  const [to, setTo] = useState("");
  const [amt, setAmt] = useState("");
  const [checked, setChecked] = useState<{ addr: string; status: RecipientStatus } | null>(null);

  const available = state?.confidential?.available;
  const pending = state?.confidential?.pending ?? 0n;
  const configured = !!state?.configured;

  const send = useAmount(amt, decimals, available, "available balance");
  const dep = useAmount(amt, decimals, state?.publicAmount, "public balance");
  const wd = useAmount(amt, decimals, available, "available balance");

  const toTrim = to.trim();
  const toValid = toTrim !== "" && isAddress(toTrim);
  const recipient: keyof typeof RECIPIENT_TEXT | null =
    toTrim === "" ? null
    : !toValid ? "invalid"
    : toTrim === owner ? "self"
    : checked?.addr === toTrim ? checked.status
    : "checking";

  useEffect(() => {
    if (!toValid || toTrim === owner) return;
    let alive = true;
    const t = setTimeout(() => {
      p.checkRecipient(toTrim).then((status) => alive && setChecked({ addr: toTrim, status })).catch(() => {});
    }, 250);
    return () => { alive = false; clearTimeout(t); };
    // p.checkRecipient identity changes with the mint; that is what we want.
  }, [toTrim, toValid, owner, p.checkRecipient]); // eslint-disable-line react-hooks/exhaustive-deps

  const copy = (t: string) => { navigator.clipboard.writeText(t); toast.success("Copied"); };
  const lockHint = configured && !unlocked ? " · unlocks first" : "";
  const switchTab = (t: Tab) => { setTab(t); setAmt(""); };

  // A render helper, not a component: a component declared here would remount
  // on every keystroke and drop the input focus.
  const amountField = (id: string, label: string, error: string | null) => (
    <div>
      <label className="lbl" htmlFor={id}>{label}</label>
      <div className="flex gap-2">
        <input id={id} className="field" placeholder="0.00" inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} aria-invalid={!!error} />
        {tab !== "deposit" && (
          <button type="button" className="btn btn-sm self-center" disabled={available === undefined || available === 0n}
            onClick={() => available !== undefined && setAmt(toUi(available, decimals).replace(/\s/g, ""))}>Max</button>
        )}
        {tab === "deposit" && (
          <button type="button" className="btn btn-sm self-center" disabled={!state?.publicAmount}
            onClick={() => state && setAmt(toUi(state.publicAmount, decimals).replace(/\s/g, ""))}>Max</button>
        )}
      </div>
      {error && <div className="hint hint-warn"><AlertCircle size={12} />{error}</div>}
    </div>
  );

  return (
    <section className="card p-6">
      <div className="tabs mb-5" role="tablist">
        {(["send", "receive", "deposit", "withdraw"] as Tab[]).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className="tab" onClick={() => switchTab(t)}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === "send" && (
        <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); if (send.value !== null) p.onSend(toTrim, send.value); }}>
          <div>
            <label className="lbl" htmlFor="to">Recipient wallet address</label>
            <input id="to" className="field" placeholder="Their Solana address" value={to} onChange={(e) => setTo(e.target.value)} autoComplete="off" spellCheck={false} />
            {recipient && (
              <div className={`hint ${RECIPIENT_TEXT[recipient].cls}`}>
                {recipient === "checking" ? <Loader2 size={12} className="spin" /> : recipient === "ready" ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
                {RECIPIENT_TEXT[recipient].text}
              </div>
            )}
          </div>
          {amountField("amt", `Amount${available !== undefined ? ` · available ${toUi(available, decimals)} ${symbol}` : ""}`, send.error)}
          {pending > 0n && (
            <div className="hint hint-muted"><AlertCircle size={12} />{toUi(pending, decimals)} {symbol} are pending. Apply them from the balance card to spend them.</div>
          )}
          <button className="btn btn-primary" type="submit" disabled={busy || !configured || recipient !== "ready" || send.value === null}>
            Send confidentially{lockHint}
          </button>
          <p className="text-xs" style={{ color: "var(--muted)", maxWidth: "52ch" }}>
            The amount is encrypted for the recipient and three zero-knowledge proofs are generated in this tab. One wallet approval covers the five transactions.
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
              {configured
                ? "Incoming confidential transfers land in your pending balance. Apply them to make them spendable."
                : "Activate your confidential balance first, otherwise senders cannot pay you."}
            </p>
          </div>
        </div>
      )}

      {tab === "deposit" && (
        <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); if (dep.value !== null) p.onDeposit(dep.value); }}>
          <p className="text-sm" style={{ color: "var(--ink-2)", maxWidth: "52ch" }}>
            Move public tokens into your confidential balance. They are spendable right away. The deposited amount is visible on-chain; what you do with it afterwards is not.
          </p>
          {amountField("dep", `Amount · public balance ${state ? toUi(state.publicAmount, decimals) : "…"} ${symbol}`, dep.error)}
          <button className="btn btn-primary" type="submit" disabled={busy || !configured || dep.value === null}>Deposit{lockHint}</button>
        </form>
      )}

      {tab === "withdraw" && (
        <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); if (wd.value !== null) p.onWithdraw(wd.value); }}>
          <p className="text-sm" style={{ color: "var(--ink-2)", maxWidth: "52ch" }}>
            Move confidential tokens back to your public balance, with a range proof. The withdrawn amount becomes visible.
          </p>
          {amountField("wd", `Amount · available ${available !== undefined ? toUi(available, decimals) : "…"} ${symbol}`, wd.error)}
          <button className="btn btn-primary" type="submit" disabled={busy || !configured || wd.value === null}>Withdraw{lockHint}</button>
        </form>
      )}
    </section>
  );
}
