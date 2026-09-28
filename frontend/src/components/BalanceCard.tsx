"use client";

import { Eye, Lock, RefreshCw } from "lucide-react";
import type { AccountState } from "@/lib/ct";
import { toUi } from "@/lib/format";

type Props = {
  state: AccountState | null;
  decimals: number;
  symbol: string;
  hasKeys: boolean;
  busy: boolean;
  onUnlock: () => void;
  onActivate: () => void;
  onApply: () => void;
  onRefresh: () => void;
};

export function BalanceCard({ state, decimals, symbol, hasKeys, busy, onUnlock, onActivate, onApply, onRefresh }: Props) {
  const c = state?.confidential;
  return (
    <section className="card p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="eyebrow">Confidential balance</div>
          <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>Decrypted locally, never leaves this tab</div>
        </div>
        <div className="flex items-center gap-1">
          {state?.configured ? <span className="chip chip-ok"><Lock size={11} /> active</span> : <span className="chip chip-muted">not activated</span>}
          <button className="btn btn-ghost btn-sm" onClick={onRefresh} disabled={busy} title="Refresh"><RefreshCw size={14} /></button>
        </div>
      </div>

      {!state ? (
        <div className="pulse h-16 rounded-lg" style={{ background: "var(--surface-2)" }} />
      ) : !state.configured ? (
        <div>
          <p className="text-sm mb-4" style={{ color: "var(--ink-2)", maxWidth: "46ch" }}>
            Activate a confidential balance for this token. Your wallet signs one message to derive your encryption keys
            (deterministic, recoverable, never stored), then one approval registers the public key on your account.
          </p>
          <button className="btn btn-primary" onClick={onActivate} disabled={busy}>Activate confidential balance</button>
        </div>
      ) : !hasKeys || !c ? (
        <div>
          <div className={`amount hero ${hasKeys ? "pulse" : ""}`} style={{ color: "var(--muted)" }}>••••••</div>
          {hasKeys ? (
            <p className="text-sm mt-3" style={{ color: "var(--muted)" }}>Decrypting…</p>
          ) : (
            <>
              <p className="text-sm mt-3 mb-4" style={{ color: "var(--ink-2)", maxWidth: "46ch" }}>
                Sign one message with your wallet to derive the decryption keys for this token.
              </p>
              <button className="btn" onClick={onUnlock} disabled={busy}><Eye size={16} /> Unlock balance</button>
            </>
          )}
        </div>
      ) : (
        <div>
          <div className="amount hero">{toUi(c.available, decimals)}<span className="unit">{symbol} available</span></div>
          <div className="mt-5">
            <div className="balance-row">
              <span className="text-sm" style={{ color: "var(--ink-2)" }}>Pending (received, not yet applied)</span>
              <span className="mono text-sm">{toUi(c.pending, decimals)}</span>
            </div>
            <div className="balance-row">
              <span className="text-sm" style={{ color: "var(--ink-2)" }}>Public (visible on-chain)</span>
              <span className="mono text-sm">{toUi(state.publicAmount, decimals)}</span>
            </div>
          </div>
          {c.pending > 0n && (
            <button className="btn btn-sm mt-3" onClick={onApply} disabled={busy}>
              Apply pending balance
            </button>
          )}
        </div>
      )}
    </section>
  );
}
