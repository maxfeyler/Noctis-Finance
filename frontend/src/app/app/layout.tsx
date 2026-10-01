import type { Metadata } from "next";
import { Providers } from "../providers";

export const metadata: Metadata = {
  title: "Noctis · App",
  description: "Send and receive confidential payments on Solana.",
};

/** Wallet providers live here so the landing page stays light. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <Providers>{children}</Providers>;
}
