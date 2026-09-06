"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { CLUSTER, explorerAddress } from "@/lib/config";
import { short } from "@/lib/format";

type Props = {
  mint: string;
  decimals: number | null;
  confidential: boolean | null;
  busy: boolean;
  onChange: (mint: string) => void;
  onCreateDemo: () => void;
  onMintDemo: () => void;
  canMintDemo: boolean;
};

export function MintPanel({ mint, decimals, confidential, busy, onChange, onCreateDemo, onMintDemo, canMintDemo }: Props) {
  // The parent keys this component by mint, so a mint set from outside
  // (demo mint created, stored value) remounts it with the editor closed.
  const [editing, setEditing] = useState(!mint);
  const [draft, setDraft] = useState(mint);
  return (
    <section className="card-lift p-5">
      <div className="flex items-center justify-between mb-2">
        <div className="eyebrow">Token</div>
        {mint && (
          <button className="btn btn-ghost btn-sm" onClick={() => { setDraft(mint); setEditing((e) => !e); }}>{editing ? "Cancel" : "Change"}</button>
        )}
      </div>
      {editing ? (
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); onChange(draft.trim()); setEditing(false); }}>
          <input className="field" placeholder="Token-2022 mint address" value={draft} onChange={(e) => setDraft(e.target.value)} spellCheck={false} />
          <button className="btn btn-primary" type="submit" disabled={!draft.trim()}>Use</button>
        </form>
      ) : (
        <div className="flex items-center gap-3 flex-wrap">
          <a className="mono text-sm link" href={explorerAddress(mint)} target="_blank" rel="noreferrer">{short(mint, 6)} <ExternalLink size={12} className="inline" /></a>
          {confidential === true && <span className="chip chip-ok">confidential extension</span>}
          {confidential === false && <span className="chip chip-crit">no confidential extension</span>}
          {decimals !== null && <span className="chip chip-muted">{decimals} decimals</span>}
        </div>
      )}
      {CLUSTER !== "mainnet" && (
        <div className="mt-4 pt-4 flex gap-2 flex-wrap items-center" style={{ borderTop: "1px solid var(--line)" }}>
          <span className="text-xs" style={{ color: "var(--muted)" }}>Test tools ({CLUSTER}):</span>
          <button className="btn btn-sm" onClick={onCreateDemo} disabled={busy}>Create demo mint</button>
          <button className="btn btn-sm" onClick={onMintDemo} disabled={busy || !canMintDemo} title={canMintDemo ? "" : "Only for a mint you created here (wallet = mint authority) and an activated account"}>Mint 1 000 to me</button>
        </div>
      )}
    </section>
  );
}
