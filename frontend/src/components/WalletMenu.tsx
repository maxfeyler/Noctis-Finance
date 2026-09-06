"use client";

import { useState } from "react";
import { useSelectedWalletAccount } from "@solana/react";
import { useConnect, useDisconnect, type UiWallet, type UiWalletAccount } from "@wallet-standard/react";
import { ChevronDown, LogOut, Wallet } from "lucide-react";
import { short } from "@/lib/format";
import { CLUSTER } from "@/lib/config";

function WalletRow({ wallet, onDone }: { wallet: UiWallet; onDone: (a: UiWalletAccount) => void }) {
  const [isConnecting, connect] = useConnect(wallet);
  return (
    <button
      className="btn w-full justify-start"
      disabled={isConnecting}
      onClick={async () => {
        const accounts = await connect();
        if (accounts[0]) onDone(accounts[0]);
      }}
    >
      {wallet.icon ? <img src={wallet.icon} alt="" width={20} height={20} className="rounded" /> : <Wallet size={18} />}
      <span>{wallet.name}</span>
      {isConnecting && <span className="ml-auto text-xs" style={{ color: "var(--muted)" }}>Connecting…</span>}
    </button>
  );
}

function Connected({ account, wallet, onDisconnected }: { account: UiWalletAccount; wallet: UiWallet; onDisconnected: () => void }) {
  const [isDisconnecting, disconnect] = useDisconnect(wallet);
  return (
    <button
      className="btn"
      disabled={isDisconnecting}
      onClick={async () => { await disconnect(); onDisconnected(); }}
      title="Disconnect"
    >
      {wallet.icon && <img src={wallet.icon} alt="" width={18} height={18} className="rounded" />}
      <span className="mono text-sm">{short(account.address)}</span>
      <LogOut size={14} style={{ color: "var(--muted)" }} />
    </button>
  );
}

export function WalletMenu() {
  const [selected, setSelected, wallets] = useSelectedWalletAccount();
  const [open, setOpen] = useState(false);
  const wallet = selected ? wallets.find((w) => w.accounts.some((a) => a.address === selected.address)) : undefined;

  if (selected && wallet) return <Connected account={selected} wallet={wallet} onDisconnected={() => setSelected(undefined)} />;

  return (
    <div className="relative">
      <button className="btn btn-primary" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Wallet size={16} /> Connect wallet <ChevronDown size={14} />
      </button>
      {open && (
        <div className="card absolute right-0 mt-2 w-72 p-2 z-20 flex flex-col gap-1">
          {wallets.length === 0 ? (
            <p className="p-3 text-sm" style={{ color: "var(--ink-2)" }}>
              No wallet found that supports <span className="mono">solana:{CLUSTER}</span>, message signing and transaction signing.
              Install Phantom or Solflare, or switch the RPC cluster.
            </p>
          ) : (
            wallets.map((w) => (
              <WalletRow key={w.name} wallet={w} onDone={(a) => { setSelected(a); setOpen(false); }} />
            ))
          )}
        </div>
      )}
    </div>
  );
}
