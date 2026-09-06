"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSelectedWalletAccount, useSignMessage, useWalletAccountTransactionSigner } from "@solana/react";
import type { UiWalletAccount } from "@wallet-standard/react";
import { address, type Address } from "@solana/kit";
import { toast } from "sonner";
import { ExternalLink } from "lucide-react";
import { WalletMenu } from "@/components/WalletMenu";
import { BalanceCard } from "@/components/BalanceCard";
import { Actions } from "@/components/Actions";
import { Activity } from "@/components/Activity";
import { MintPanel } from "@/components/MintPanel";
import { CHAIN, CLUSTER, DEFAULT_MINT, explorerAddress, explorerTx } from "@/lib/config";
import { createNoctisClient } from "@/lib/client";
import { deriveConfidentialKeys, messageSignerFromWallet, type ConfidentialKeys } from "@/lib/keys";
import * as ct from "@/lib/ct";
import { errorMessage, toUi } from "@/lib/format";

const MINT_KEY = "noctis:mint";

export default function Page() {
  const [account] = useSelectedWalletAccount();
  return (
    <main className="min-h-screen">
      <header className="flex items-center justify-between px-6 py-4 max-w-5xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="mark" aria-hidden />
          <div>
            <div className="display text-xl leading-none">Noctis</div>
            <div className="eyebrow mt-1">confidential payments · {CLUSTER}</div>
          </div>
        </div>
        <WalletMenu />
      </header>
      <div className="max-w-5xl mx-auto px-6 pb-20">
        {account ? <Session account={account} /> : <Hero />}
      </div>
    </main>
  );
}

function Hero() {
  return (
    <section className="mt-16 grid gap-10 md:grid-cols-[1.2fr_1fr] items-start">
      <div>
        <h1 className="display" style={{ fontSize: "clamp(2.2rem, 5vw, 3.4rem)", lineHeight: 1.05 }}>
          Pay on Solana without publishing the amount.
        </h1>
        <p className="mt-5 text-lg" style={{ color: "var(--ink-2)", maxWidth: "48ch" }}>
          Noctis is a thin interface over Token-2022 confidential transfers. Amounts are encrypted with ElGamal,
          proofs are generated in this tab and verified on-chain. Sender, recipient and token stay public.
        </p>
        <p className="mt-4 text-sm" style={{ color: "var(--muted)", maxWidth: "48ch" }}>
          Connect a wallet that supports <span className="mono">{CHAIN}</span>, message signing and transaction signing.
        </p>
      </div>
      <ol className="card p-6 m-0 list-none grid gap-4 text-sm">
        {[
          ["Activate", "Two signatures derive your encryption keys. One transaction registers the public key."],
          ["Deposit", "Public tokens move into an encrypted pending balance, then you apply them."],
          ["Send", "The amount is encrypted for the recipient with three zero-knowledge proofs."],
          ["Withdraw", "Bring tokens back to a public balance whenever you need to."],
        ].map(([t, d], i) => (
          <li key={t} className="grid grid-cols-[28px_1fr] gap-3">
            <span className="display" style={{ color: "var(--accent)", fontSize: "1.3rem", lineHeight: 1 }}>{i + 1}</span>
            <span><strong className="font-medium">{t}.</strong> <span style={{ color: "var(--ink-2)" }}>{d}</span></span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Session({ account }: { account: UiWalletAccount }) {
  const owner = address(account.address);
  const txSigner = useWalletAccountTransactionSigner(account, CHAIN);
  const signMessage = useSignMessage(account);
  const client = useMemo(() => createNoctisClient(txSigner), [txSigner]);

  const [mint, setMint] = useState<string>(() => {
    try { return localStorage.getItem(MINT_KEY) ?? DEFAULT_MINT; } catch { return DEFAULT_MINT; }
  });
  const [mintInfo, setMintInfo] = useState<{ decimals: number; confidential: boolean; authority: string | null } | null>(null);
  const [keys, setKeys] = useState<ConfidentialKeys | null>(null);
  const [state, setState] = useState<ct.AccountState | null>(null);
  const [activity, setActivity] = useState<ct.ActivityItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingActivity, setLoadingActivity] = useState(false);
  const mintAddr = useMemo(() => { try { return mint ? address(mint) : null; } catch { return null; } }, [mint]);
  const keysRef = useRef(keys);
  keysRef.current = keys;

  // Keys are bound to (owner, mint): drop them when either changes.
  useEffect(() => { setKeys(null); setState(null); setActivity(null); }, [owner, mintAddr]);

  const refresh = useCallback(async (k: ConfidentialKeys | null = keysRef.current) => {
    if (!mintAddr) return;
    try {
      const [m, s] = await Promise.all([ct.loadMint(client, mintAddr), ct.loadAccountState(client, owner, mintAddr, k ?? undefined)]);
      setMintInfo({
        decimals: m.decimals,
        confidential: ct.mintHasConfidentialExtension(m),
        authority: m.mintAuthority.__option === "Some" ? m.mintAuthority.value : null,
      });
      setState(s);
      setLoadingActivity(true);
      ct.loadActivity(client, s.token).then(setActivity).catch(() => setActivity([])).finally(() => setLoadingActivity(false));
    } catch (e) {
      toast.error("Could not load this token", { description: errorMessage(e) });
      setMintInfo(null);
    }
  }, [client, owner, mintAddr]);

  useEffect(() => { void refresh(null); }, [refresh]);

  const decimals = mintInfo?.decimals ?? 0;
  const symbol = "tokens";

  /** Wraps an action with busy state, progress toasts and a refresh. */
  const act = useCallback(async (label: string, fn: (progress: ct.Progress) => Promise<readonly string[] | { signatures: readonly string[]; extra?: string }>) => {
    if (busy) return;
    setBusy(true);
    const id = toast.loading(label);
    try {
      const out = await fn((msg) => toast.loading(msg, { id }));
      const signatures = "signatures" in out ? out.signatures : out;
      const extra = "signatures" in out ? out.extra : undefined;
      const last = signatures[signatures.length - 1];
      toast.success(`${label} · done`, {
        id,
        description: extra,
        action: last ? { label: "Explorer", onClick: () => window.open(explorerTx(last), "_blank") } : undefined,
      });
      await refresh();
    } catch (e) {
      console.error(e);
      toast.error(`${label} · failed`, { id, description: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }, [busy, refresh]);

  const unlock = useCallback(async (): Promise<ConfidentialKeys> => {
    if (keysRef.current) return keysRef.current;
    if (!mintAddr) throw new Error("Choose a token first");
    const signer = messageSignerFromWallet(owner, signMessage);
    const k = await deriveConfidentialKeys(signer, mintAddr);
    setKeys(k);
    keysRef.current = k;
    return k;
  }, [owner, mintAddr, signMessage]);

  const onUnlock = () => act("Unlock balance", async (p) => { p("Sign two messages to derive your keys"); await unlock(); return []; });
  const onActivate = () => act("Activate confidential balance", async (p) => {
    p("Sign two messages to derive your keys");
    const k = await unlock();
    return ct.activate(client, txSigner, k, p);
  });
  const onApply = () => act("Apply pending balance", async (p) => ct.applyPending(client, txSigner, state!.token, await unlock(), p));
  const onDeposit = (amount: bigint) => act("Deposit", (p) => ct.deposit(client, txSigner, state!.token, mintAddr!, amount, decimals, p));
  const onWithdraw = (amount: bigint) => act("Withdraw", async (p) => ct.withdraw(client, txSigner, await unlock(), state!.token, amount, decimals, p));
  const onSend = (to: string, amount: bigint) => act(`Send ${toUi(amount, decimals)} confidentially`, async (p) => {
    let dest: Address;
    try { dest = address(to); } catch { throw new Error("Invalid recipient address"); }
    if (dest === owner) throw new Error("That is your own address");
    const r = await ct.transfer(client, txSigner, await unlock(), state!.token, dest, amount, p);
    return { signatures: r.signatures, extra: `Proofs generated in ${r.proofMs} ms · ${r.signatures.length} transactions` };
  });
  const onCreateDemo = () => act("Create demo mint", async (p) => {
    const r = await ct.createDemoMint(client, txSigner, 2, p);
    changeMint(r.mint);
    return { signatures: r.signatures, extra: `Mint ${r.mint}` };
  });
  const onMintDemo = () => act("Mint 1 000 demo tokens", (p) => ct.mintDemoTokens(client, txSigner, mintAddr!, state!.token, 1000n * 10n ** BigInt(decimals), p));

  const changeMint = (m: string) => {
    setMint(m);
    try { localStorage.setItem(MINT_KEY, m); } catch {}
  };

  const ready = !!(state?.configured && keys);
  const canMintDemo = !!(mintInfo?.authority === owner && state?.exists);

  return (
    <div className="mt-6 grid gap-5">
      <MintPanel
        key={mint}
        mint={mint}
        decimals={mintInfo?.decimals ?? null}
        confidential={mintInfo ? mintInfo.confidential : null}
        busy={busy}
        onChange={changeMint}
        onCreateDemo={onCreateDemo}
        onMintDemo={onMintDemo}
        canMintDemo={canMintDemo}
      />
      {!mintAddr ? (
        <p className="text-sm px-1" style={{ color: "var(--muted)" }}>
          Enter a Token-2022 mint that has the confidential transfer extension{CLUSTER !== "mainnet" ? ", or create a demo mint" : ""}.
        </p>
      ) : mintInfo && !mintInfo.confidential ? (
        <p className="text-sm px-1" style={{ color: "var(--crit)" }}>This mint has no ConfidentialTransfer extension. Confidential balances cannot be enabled on it.</p>
      ) : (
        <>
          <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
            <BalanceCard
              state={state}
              decimals={decimals}
              symbol={symbol}
              hasKeys={!!keys}
              busy={busy}
              onUnlock={onUnlock}
              onActivate={onActivate}
              onApply={onApply}
              onRefresh={() => void refresh()}
            />
            <Actions
              owner={owner}
              mint={mint}
              state={state}
              decimals={decimals}
              symbol={symbol}
              ready={ready}
              busy={busy}
              onSend={onSend}
              onDeposit={onDeposit}
              onWithdraw={onWithdraw}
            />
          </div>
          <Activity items={activity} loading={loadingActivity} />
          <p className="text-xs px-1" style={{ color: "var(--muted)" }}>
            Token account {state?.token ? <a className="link mono" href={explorerAddress(state.token)} target="_blank" rel="noreferrer">{state.token} <ExternalLink size={10} className="inline" /></a> : "…"}
          </p>
        </>
      )}
    </div>
  );
}
