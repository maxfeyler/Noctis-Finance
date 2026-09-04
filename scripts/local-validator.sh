#!/usr/bin/env bash
# Starts a local validator able to verify confidential transfers.
#
# Two things are required and neither is the default:
#   1. Agave >= 4.0 — earlier ZK ElGamal Proof verifiers predate the June 2025
#      transcript fix and reject every proof produced by @solana/zk-sdk.
#   2. The current Token-2022 program — the one bundled with the test validator
#      still has confidential instructions disabled (returns InvalidInstructionData).
#      We clone it from mainnet, together with the SPL Record program used by the
#      "…WithRecord" proof variants.
set -euo pipefail

LEDGER="${LEDGER:-.ledger}"
CLONE_FROM="${CLONE_FROM:-https://api.mainnet-beta.solana.com}"
TOKEN_2022=TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb
RECORD=recr1L3PCGKLbckBqMNcJhuuyU1zgo8nBhfLVsJNwr5

version=$(solana-test-validator --version | awk '{print $2}')
major=${version%%.*}
if [ "$major" -lt 4 ]; then
  echo "solana-test-validator $version is too old: Agave >= 4.0 is required (agave-install init 4.2.2)." >&2
  exit 1
fi

echo "solana-test-validator $version, cloning Token-2022 + Record from $CLONE_FROM"
exec solana-test-validator \
  --ledger "$LEDGER" --reset --quiet \
  --url "$CLONE_FROM" \
  --clone-upgradeable-program "$TOKEN_2022" \
  --clone-upgradeable-program "$RECORD" \
  "$@"
