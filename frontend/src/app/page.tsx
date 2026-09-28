"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSelectedWalletAccount, useSignMessage, useSignTransactions, useWalletAccountTransactionSigner } from "@solana/react";
import type { UiWalletAccount } from "@wallet-standard/react";
import { address } from "@solana/kit";
import { ExternalLink } from "lucide-react";
import { WalletMenu } from "@/components/WalletMenu";
import { BalanceCard } from "@/components/BalanceCard";
import { Actions } from "@/components/Actions";
import { Activity } from "@/components/Activity";
import { MintPanel } from "@/components/MintPanel";
import { OperationPanel } from "@/components/OperationPanel";
import { batchSignerFromWallet } from "@/lib/batch";
import { STEP_LABELS, type OpContext, type Operation, type StepId } from "@/lib/operation";
import { CHAIN, CLUSTER, DEFAULT_MINT, explorerAddress } from "@/lib/config";
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
          ["Activate", "One signed message derives your encryption keys. One approval registers the public key."],
          ["Deposit", "Public tokens move into your encrypted balance, spendable right away."],
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
  const signTransactions = useSignTransactions(account, CHAIN);
  const signMessage = useSignMessage(account);
  const client = useMemo(() => createNoctisClient(txSigner), [txSigner]);
  const wallet = useMemo(() => batchSignerFromWallet(owner, signTransactions), [owner, signTransactions]);
  const messageSigner = useMemo(() => messageSignerFromWallet(owner, signMessage), [owner, signMessage]);

  const [mint, setMint] = useState<string>(() => {
    try { return localStorage.getItem(MINT_KEY) ?? DEFAULT_MINT; } catch { return DEFAULT_MINT; }
  });
  const [mintInfo, setMintInfo] = useState<{ decimals: number; confidential: boolean; authority: string | null } | null>(null);
  const [keys, setKeys] = useState<ConfidentialKeys | null>(null);
  const [state, setState] = useState<ct.AccountState | null>(null);
  const [activity, setActivity] = useState<ct.ActivityItem[] | null>(null);
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [op, setOp] = useState<Operation | null>(null);
  const busy = op?.status === "running";
  const mintAddr = useMemo(() => { try { return mint ? address(mint) : null; } catch { return null; } }, [mint]);
  const keysRef = useRef(keys);
  useEffect(() => { keysRef.current = keys; }, [keys]);

  // Keys are bound to (owner, mint): drop them when either changes.
  const scope = `${owner}:${mintAddr}`;
  const [lastScope, setLastScope] = useState(scope);
  if (scope !== lastScope) {
    setLastScope(scope);
    setKeys(null); setState(null); setActivity(null);
    keysRef.current = null;
  }

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
      setMintInfo(null);
      setOp({ title: "Load token", steps: [], signatures: [], status: "error", error: errorMessage(e) });
    }
  }, [client, owner, mintAddr]);

  useEffect(() => { void refresh(null); }, [refresh]);

  const decimals = mintInfo?.decimals ?? 0;
  const symbol = "tokens";

  /** Runs one operation with a live step list; the panel stays up until closed. */
  const run = useCallback(async (
    title: string,
    stepIds: StepId[],
    fn: (ctx: { op: OpContext; client: typeof client; wallet: typeof wallet; owner: typeof txSigner }) => Promise<string | void>,
  ) => {
    if (busy) return;
    const steps = stepIds.map((id) => ({ id, label: STEP_LABELS[id], status: "todo" as const }));
    setOp({ title, steps, signatures: [], status: "running" });
    const patch = (f: (o: Operation) => Operation) => setOp((o) => (o ? f(o) : o));
    const setStep = (id: StepId, change: Partial<Operation["steps"][number]>) =>
      patch((o) => ({ ...o, steps: o.steps.map((s) => (s.id === id ? { ...s, ...change } : s)) }));
    const ctx: OpContext = {
      step: (id, detail) => patch((o) => ({
        ...o,
        steps: o.steps.map((s) => s.status === "active" ? { ...s, status: "done" } : s.id === id ? { ...s, status: "active", detail } : s),
      })),
      detail: (id, detail) => setStep(id, { detail }),
      skip: (id, detail) => setStep(id, { status: "done", detail }),
      signature: (sig) => patch((o) => ({ ...o, signatures: [...o.signatures, sig] })),
    };
    try {
      const summary = await fn({ op: ctx, client, wallet, owner: txSigner });
      patch((o) => ({
        ...o,
        status: "done",
        summary: summary || undefined,
        steps: o.steps.map((s) => (s.status === "active" || s.status === "todo" ? { ...s, status: "done" } : s)),
      }));
      await refresh();
    } catch (e) {
      console.error(e);
      patch((o) => ({
        ...o,
        status: "error",
        error: errorMessage(e),
        steps: o.steps.map((s) => (s.status === "active" ? { ...s, status: "error" } : s)),
      }));
    }
  }, [busy, client, wallet, txSigner, refresh]);

  /** Derives the keys once per (owner, mint); later calls are instant. */
  const unlock = useCallback(async (op: OpContext): Promise<ConfidentialKeys> => {
    if (keysRef.current) { op.skip("keys", "Already unlocked"); return keysRef.current; }
    if (!mintAddr) throw new Error("Choose a token first");
    op.step("keys", "Sign one message in your wallet");
    const k = await deriveConfidentialKeys(messageSigner, mintAddr);
    keysRef.current = k;
    setKeys(k);
    return k;
  }, [mintAddr, messageSigner]);

  const token = state?.token;
  const onUnlock = () => run("Unlock balance", ["keys"], async ({ op }) => { await unlock(op); });
  const onActivate = () => run("Activate confidential balance", ["keys", "prepare", "sign", "confirm"], async (c) => {
    await ct.activate(c, await unlock(c.op));
    return "Your confidential balance is active. Deposit tokens or share your address to get paid.";
  });
  const onApply = () => run("Apply pending balance", ["keys", "prepare", "sign", "confirm"], async (c) => {
    await ct.applyPending(c, await unlock(c.op), token!);
    return "Received funds are now spendable.";
  });
  const onDeposit = (amount: bigint) => run(`Deposit ${toUi(amount, decimals)} ${symbol}`, ["keys", "prepare", "sign", "confirm"], async (c) => {
    await ct.depositAndApply(c, await unlock(c.op), token!, amount, decimals);
    return "Deposited and spendable, in one transaction.";
  });
  const onWithdraw = (amount: bigint) => run(`Withdraw ${toUi(amount, decimals)} ${symbol}`, ["keys", "prepare", "sign", "confirm"], async (c) => {
    await ct.withdraw(c, await unlock(c.op), token!, amount, decimals);
    return "Back in your public balance.";
  });
  const onSend = (to: string, amount: bigint) => run(`Send ${toUi(amount, decimals)} ${symbol}`, ["keys", "prepare", "sign", "confirm"], async (c) => {
    const r = await ct.transfer(c, await unlock(c.op), token!, address(to), amount);
    return `Sent. Only ciphertexts and proofs went on-chain. Proofs took ${r.proofMs} ms.`;
  });
  const onCreateDemo = () => run("Create demo mint", ["sign", "confirm"], async (c) => {
    const m = await ct.createDemoMint(c, 2);
    changeMint(m);
    return `New confidential mint ${m.slice(0, 8)}… with you as mint authority.`;
  });
  const onMintDemo = () => run("Mint 1 000 demo tokens", ["sign", "confirm"], async (c) => {
    await ct.mintDemoTokens(c, mintAddr!, token!, 1000n * 10n ** BigInt(decimals));
    return "1 000 tokens in your public balance. Deposit them to make them confidential.";
  });

  const checkRecipient = useCallback(
    (to: string) => (mintAddr ? ct.recipientStatus(client, address(to), mintAddr) : Promise.resolve("no-account" as const)),
    [client, mintAddr],
  );

  const changeMint = (m: string) => {
    setMint(m);
    try { localStorage.setItem(MINT_KEY, m); } catch {}
  };

  const closeOp = useCallback(() => setOp(null), []);
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
              unlocked={!!keys}
              busy={busy}
              checkRecipient={checkRecipient}
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
      {op && <OperationPanel op={op} onClose={closeOp} />}
    </div>
  );
}
