"use client";

import { ExternalLink } from "lucide-react";
import { explorerTx } from "@/lib/config";
import { humanKind, type ActivityItem } from "@/lib/ct";
import { short } from "@/lib/format";

export function Activity({ items, loading }: { items: ActivityItem[] | null; loading: boolean }) {
  return (
    <section className="card p-6">
      <div className="flex items-center justify-between mb-3">
        <div className="eyebrow">Activity</div>
        {loading && <span className="text-xs pulse" style={{ color: "var(--muted)" }}>updating…</span>}
      </div>
      {!items ? (
        <div className="pulse h-10 rounded" style={{ background: "var(--surface-2)" }} />
      ) : items.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--muted)" }}>Nothing yet for this token account.</p>
      ) : (
        <ul className="m-0 p-0 list-none">
          {items.map((it) => (
            <li key={it.signature} className="balance-row" style={{ gridTemplateColumns: "1fr auto auto" }}>
              <div>
                <div className="text-sm">{it.kinds.length ? Array.from(new Set(it.kinds.map(humanKind))).join(" · ") : "Transaction"}</div>
                <div className="text-xs mono" style={{ color: "var(--muted)" }}>{short(it.signature, 6)}</div>
              </div>
              <span className="text-xs" style={{ color: it.ok ? "var(--muted)" : "var(--crit)" }}>
                {it.ok ? (it.time ? new Date(it.time).toLocaleString() : "") : "failed"}
              </span>
              <a className="link" href={explorerTx(it.signature)} target="_blank" rel="noreferrer" title="Open in explorer"><ExternalLink size={14} /></a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
