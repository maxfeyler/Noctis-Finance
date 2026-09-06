"use client";

import { useEffect } from "react";
import { SelectedWalletAccountContextProvider } from "@solana/react";
import type { UiWallet } from "@wallet-standard/react";
import { Toaster } from "sonner";
import { CHAIN } from "@/lib/config";

const STORAGE_KEY = "noctis:selected-wallet";

function filterWallets(w: UiWallet) {
  return (
    w.chains.includes(CHAIN) &&
    w.features.includes("solana:signTransaction") &&
    w.features.includes("solana:signMessage")
  );
}
const stateSync = {
  getSelectedWallet: () => {
    try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
  },
  storeSelectedWallet: (k: string) => {
    try { localStorage.setItem(STORAGE_KEY, k); } catch {}
  },
  deleteSelectedWallet: () => {
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  },
};

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_DEV_WALLET === "1") {
      import("@/lib/devWallet").then((m) => m.registerDevWallet());
    }
  }, []);
  return (
    <SelectedWalletAccountContextProvider filterWallets={filterWallets} stateSync={stateSync}>
      {children}
      <Toaster position="bottom-right" theme="system" toastOptions={{ className: "toast" }} />
    </SelectedWalletAccountContextProvider>
  );
}
