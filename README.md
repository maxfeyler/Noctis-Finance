# Noctis Finance

**Confidential payments on Solana, built on Token-2022 Confidential Transfers.**

Noctis is the product layer on top of Solana's native confidential transfer
extension: a wallet-connected interface that hides the *amount* of a token
transfer while keeping the sender, recipient and mint public and auditable.
It does not invent cryptography. Amounts are encrypted with twisted ElGamal,
proofs are generated client-side with the official `@solana/zk-sdk` (WASM) and
verified on-chain by the ZK ElGamal Proof program.

> **Status: working end-to-end on a local validator, CLI and web app.**
> The previous iteration of this repo was a hackathon PoC whose README
> overstated what the code did. This version starts from the truth.

## What works today

| Step | Status | Where |
|---|---|---|
| Mint with `ConfidentialTransferMint` extension | ✅ | `scripts/ct.ts` |
| ElGamal + AES key derivation from a wallet signature | ✅ | `scripts/ct.ts` |
| Configure confidential token accounts (pubkey-validity proof) | ✅ | `scripts/ct.ts` |
| Deposit public → pending balance, apply pending → available | ✅ | `scripts/ct.ts` |
| **Confidential transfer** (equality + validity + range proofs) | ✅ | `scripts/ct.ts` |
| Local decryption of pending / available balances | ✅ | `scripts/ct.ts` |
| Withdraw available → public balance | ✅ | `scripts/ct.ts` |
| Wallet-connected web app: activate, deposit, apply, send, receive (QR), withdraw, activity | ✅ | `frontend/` |
| Built-in burner wallet for extension-free demos (`NEXT_PUBLIC_DEV_WALLET=1`) | ✅ | `frontend/src/lib/devWallet.ts` |
| Payment requests (pay-by-link / QR with encrypted amount) | 📋 planned | — |
| Per-mint auditor key and read-only compliance view | 📋 planned | — |

There is **no custom on-chain program**. Token-2022 is the program. A small
Anchor program will only be reintroduced when it carries real product value
(payment requests), not to wrap what Token-2022 already does.

## What is hidden, what is not

| | Visible on-chain |
|---|---|
| Transfer amount | **No** — only ciphertexts and proofs |
| Sender and recipient token accounts | Yes |
| Mint, timestamp, fee payer | Yes |
| Deposit and withdraw amounts (public ↔ confidential bridge) | Yes |
| Encrypted balances | Ciphertext only; decryptable by the owner (and the auditor key if one is set) |

Confidential Transfers hide *how much*, not *who*. Address-level privacy is out
of scope for this project.

## Quickstart

Requirements: Node ≥ 22, and **Agave ≥ 4.0** for the local validator.
Earlier Agave versions ship a ZK ElGamal Proof verifier that predates the
June 2025 transcript fix and reject every proof produced by the current SDK.

```bash
npm install
```

Terminal 1 — local validator with the current Token-2022 program cloned from
mainnet (the one bundled with the test validator still has confidential
instructions disabled):

```bash
./scripts/local-validator.sh
```

Terminal 2 — fund your CLI wallet and run the full lifecycle:

```bash
solana airdrop 10 -u localhost
npm run ct
```

Environment variables: `RPC_URL` (default `http://127.0.0.1:8899`), `KEYPAIR`
(default `~/.config/solana/id.json`), `AMOUNT`, `SEND`, `DECIMALS`.
On devnet or mainnet, transaction links are printed for the Solana Explorer.

`npm run account -- setup|balance|apply <mint>` manages the CLI wallet's own
confidential account on any mint, e.g. to act as the recipient of a transfer
sent from the web app.

### Web app

```bash
cd frontend && npm install
cp .env.example .env.local      # set NEXT_PUBLIC_RPC_URL; NEXT_PUBLIC_DEV_WALLET=1 for a burner wallet
npm run dev                     # landing on http://localhost:3000, app on /app
```

The landing page (`/`) renders a live WebGL aurora exported from a design tool
(`frontend/src/components/landing/NorthernLights.jsx`, generated, do not edit;
about 110 kB gzipped, loaded after the text). "Enter App" leads to `/app`.

The app talks to the wallet through the Wallet Standard (`@wallet-standard/react`
+ `@solana/react`), so any wallet exposing `solana:signTransaction` and
`solana:signMessage` on the configured chain works: Phantom, Solflare, Backpack…
Screens: choose or create a token, activate the confidential balance (two
message signatures derive the keys, one transaction registers them), deposit,
apply, send to a wallet address, receive with a QR code, withdraw, activity.
Balances are decrypted in the tab and the keys live in memory only.

Wallet approvals per operation:

| Operation | Approvals | Transactions |
|---|---|---|
| Unlock keys | 1 message | 0 |
| Activate | 1 message + 1 | 1 |
| Deposit (spendable immediately) | 1 | 1 |
| Send | 1 | 5 |
| Withdraw | 1 | 4 |

All transactions of an operation are planned up front and approved in a single
Wallet Standard `signTransaction` call, then sent in order. Deposit and
apply-pending are merged into one transaction: the new decryptable balance is
computed and encrypted locally. A progress panel shows each step (keys, proofs,
approval, confirmations) with explorer links.

With `NEXT_PUBLIC_DEV_WALLET=1` a "Noctis Dev Wallet" appears in the connect
menu: a burner key kept in `localStorage`, auto-funded on localnet, meant for
demos and tests only.

### Sample run (Agave 4.2.2, local, Apple Silicon)

```
▸ 1. Create mint with ConfidentialTransfer extension          ⏱ 1.4 s
▸ 2. Derive ElGamal + AES keys (sender, recipient)            ⏱ 0.5 s
▸ 3. Configure confidential token accounts                    ⏱ 5.4 s
▸ 4. Mint 100.00 public tokens, deposit, apply pending        ⏱ 6.4 s
   sender available: 100.00
▸ 5. Confidential transfer of 42.50 → recipient
   ⏱ proof generation 233 ms
   ⏱ total incl. 5 transactions 9.1 s
▸ 6. Recipient applies pending balance, both decrypt locally
   sender    available 57.50  pending 0.00
   recipient available 42.50  pending 0.00
▸ 7. Recipient withdraws 21.25 to public balance
   recipient public 21.25  confidential 21.25
```

The transfer is five transactions: three proof-context accounts
(`VerifyCiphertextCommitmentEquality`, `VerifyBatchedGroupedCiphertext3HandlesValidity`,
`VerifyBatchedRangeProofU128`), the `ConfidentialTransferInstruction::Transfer`
itself, and the close of the context accounts. In the transfer transaction the
public token balances read `0 → 0`; the amount `42.50` appears nowhere.

Proof generation takes well under a second on a laptop, which is what makes a
browser wallet flow realistic.

## How it works

```
 wallet signature ──► ElGamal keypair + AES key   (deterministic per owner × mint,
                                                    recoverable, never stored)
        │
        ▼
 [1] ConfigureAccount   registers the ElGamal pubkey, proves it is well-formed
 [2] Deposit            public balance ──► pending (encrypted) balance
 [3] ApplyPendingBalance pending ──► available, owner re-encrypts the new total
 [4] Transfer           encrypts the amount for recipient + auditor,
                        proves equality / validity / range in context accounts
 [5] Withdraw           available ──► public, with a range proof
```

Stack: [`@solana/kit`](https://github.com/anza-xyz/kit) 8 ·
[`@solana-program/token-2022`](https://github.com/solana-program/token-2022)
(`/confidential` helpers) · [`@solana/zk-sdk`](https://github.com/solana-program/zk-elgamal-proof)
0.5 (WASM) · Agave ≥ 4.0.

## Roadmap

1. ~~Reproducible build, remove leaked keys, honest README~~ ✅
2. ~~Real confidential transfer lifecycle, scripted and timed~~ ✅
3. ~~Web app on `@solana/kit` + Wallet Standard~~ ✅ — one approval per
   operation ✅; next: proofs in a Web Worker, payment-request links.
4. **Differentiation**: payment requests (encrypted amount, memo, expiry) via a
   thin Anchor program; per-mint auditor key and compliance view. Then an SDK.

## Security notes

- **Key derivation.** Keys are derived from a domain-separated message signed
  by the wallet (`solana-conf-bal/v1`, bound to owner × mint). Any dapp that
  obtains the same signature obtains the decryption keys. The web app will make
  that signature request explicit and distinctive.
- **Leaked keys.** Earlier commits of this repository contained private keys
  (`scripts/*.json`, test-ledger keypairs). They are removed from the tree and
  must be treated as burned. Never fund those addresses.
- **Not audited. Not for production.** Devnet and localnet only.

## License

MIT — see [LICENSE](LICENSE).
