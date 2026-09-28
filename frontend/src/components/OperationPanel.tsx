"use client";

import { useEffect } from "react";
import { CheckCircle2, Circle, ExternalLink, Loader2, X, XCircle } from "lucide-react";
import { explorerTx } from "@/lib/config";
import type { Operation } from "@/lib/operation";
import { short } from "@/lib/format";

export function OperationPanel({ op, onClose }: { op: Operation; onClose: () => void }) {
  const last = op.signatures[op.signatures.length - 1];
  // Successes fade out on their own; errors stay until the person closes them.
  useEffect(() => {
    if (op.status !== "done") return;
    const t = setTimeout(onClose, 10_000);
    return () => clearTimeout(t);
  }, [op.status, onClose]);
  return (
    <aside className="op-panel card" role="status" aria-live="polite">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <div className="eyebrow">{op.status === "running" ? "In progress" : op.status === "done" ? "Done" : "Failed"}</div>
          <div className="display text-lg leading-tight mt-1">{op.title}</div>
        </div>
        {op.status !== "running" && (
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close"><X size={14} /></button>
        )}
      </div>

      <ol className="m-0 p-0 list-none grid gap-3">
        {op.steps.map((s) => (
          <li key={s.id} className="grid grid-cols-[20px_1fr] gap-3 items-start">
            <span className="mt-0.5" aria-hidden>
              {s.status === "done" && <CheckCircle2 size={16} style={{ color: "var(--ok)" }} />}
              {s.status === "active" && <Loader2 size={16} className="spin" style={{ color: "var(--accent)" }} />}
              {s.status === "error" && <XCircle size={16} style={{ color: "var(--crit)" }} />}
              {s.status === "todo" && <Circle size={16} style={{ color: "var(--line)" }} />}
            </span>
            <div>
              <div className="text-sm" style={{ color: s.status === "todo" ? "var(--muted)" : "var(--ink)" }}>{s.label}</div>
              {s.detail && <div className="mono text-xs mt-0.5" style={{ color: "var(--muted)" }}>{s.detail}</div>}
            </div>
          </li>
        ))}
      </ol>

      {op.status === "error" && op.error && (
        <p className="text-sm mt-4 p-3 rounded-lg" style={{ background: "var(--crit-soft)", color: "var(--crit)" }}>{op.error}</p>
      )}
      {op.status === "done" && op.summary && <p className="text-sm mt-4" style={{ color: "var(--ink-2)" }}>{op.summary}</p>}
      {last && op.status !== "running" && (
        <div className="mt-4 pt-3 flex flex-wrap gap-x-3 gap-y-1" style={{ borderTop: "1px solid var(--line)" }}>
          {op.signatures.map((sig, i) => (
            <a key={sig} className="link mono text-xs" href={explorerTx(sig)} target="_blank" rel="noreferrer">
              {op.signatures.length > 1 ? `tx ${i + 1}` : short(sig, 6)} <ExternalLink size={10} className="inline" />
            </a>
          ))}
        </div>
      )}
    </aside>
  );
}
