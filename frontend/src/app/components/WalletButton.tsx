'use client';

import { useEffect, useState } from 'react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';

export default function WalletButton() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="h-10 w-32 bg-white/10 rounded-lg animate-pulse" />
    );
  }

  return (
    <WalletMultiButton className="!bg-gradient-to-r !from-purple-600 !to-blue-600 !rounded-lg hover:!from-purple-700 hover:!to-blue-700 !transition-all" />
  );
}
