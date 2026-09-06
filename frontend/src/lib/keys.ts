import type { Address, MessagePartialSigner, SignatureDictionary, SignableMessage } from "@solana/kit";
import { AeKey, ElGamalKeypair, ElGamalSecretKey } from "@solana/zk-sdk";
import {
  deriveAeKeyForOwnerMint,
  deriveElGamalKeypairForOwnerMint,
} from "@solana-program/token-2022/confidential";

/** Session-only confidential keys for one (owner, mint) pair. Never persisted. */
export type ConfidentialKeys = Readonly<{
  owner: Address;
  mint: Address;
  elgamalKeypair: ElGamalKeypair;
  aesKey: AeKey;
}>;

export type SignMessageFn = (input: { message: Uint8Array }) => Promise<{ signature: Uint8Array }>;

/**
 * The SDK derives keys through a `MessagePartialSigner`; wallets expose a
 * `signMessage` feature instead. This adapter bridges the two.
 */
export function messageSignerFromWallet(address: Address, signMessage: SignMessageFn): MessagePartialSigner {
  return {
    address,
    async signMessages(messages: readonly SignableMessage[]): Promise<readonly SignatureDictionary[]> {
      const out: SignatureDictionary[] = [];
      for (const m of messages) {
        const { signature } = await signMessage({ message: m.content });
        out.push(Object.freeze({ [address]: signature }) as SignatureDictionary);
      }
      return out;
    },
  };
}

/**
 * Derives the ElGamal keypair and AES key bound to (owner, mint) from two
 * wallet signatures over the `solana-conf-bal/v1` domain-separated messages.
 * Deterministic: the same wallet always recovers the same keys.
 */
export async function deriveConfidentialKeys(
  signer: MessagePartialSigner,
  mint: Address,
): Promise<ConfidentialKeys> {
  const owner = signer.address;
  const eg = await deriveElGamalKeypairForOwnerMint({ signer, owner, mint });
  const ae = await deriveAeKeyForOwnerMint({ signer, owner, mint });
  return {
    owner,
    mint,
    elgamalKeypair: ElGamalKeypair.fromSecretKey(ElGamalSecretKey.fromBytes(eg.secretKey)),
    aesKey: AeKey.fromBytes(ae),
  };
}
