import type { Metadata } from "next";
import { Fraunces, IBM_Plex_Mono, IBM_Plex_Sans, Instrument_Serif } from "next/font/google";
import "./globals.css";

const display = Fraunces({ subsets: ["latin"], variable: "--font-display", axes: ["opsz"] });
const sans = IBM_Plex_Sans({ subsets: ["latin"], variable: "--font-sans", weight: ["300", "400", "500", "600"] });
const mono = IBM_Plex_Mono({ subsets: ["latin"], variable: "--font-mono", weight: ["400", "500"] });
const editorial = Instrument_Serif({ subsets: ["latin"], variable: "--font-editorial", weight: "400", style: ["normal", "italic"] });

export const metadata: Metadata = {
  title: "Noctis Finance",
  description: "The place where your money moves privately. Confidential payments on Solana.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable} ${editorial.variable}`}>
      <body>
        {children}
      </body>
    </html>
  );
}
