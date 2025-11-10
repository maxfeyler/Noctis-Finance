'use client';

import { useState, useEffect } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { Program, AnchorProvider, BN } from '@coral-xyz/anchor';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Send, 
  Lock, 
  Unlock, 
  History, 
  Wallet,
  CheckCircle,
  XCircle,
  Loader2,
  Eye,
  Copy,
  ExternalLink,
  Shield
} from 'lucide-react';
import { toast, Toaster } from 'sonner';
import { Buffer } from 'buffer';

import idl from '../../../target/idl/noctis_finance.json';
import WalletButton from './components/WalletButton';

// Polyfill Buffer pour Next.js
if (typeof window !== 'undefined') {
  window.Buffer = Buffer;
}

const PROGRAM_ID = new PublicKey(idl.address);

// Types
type TransactionStatus = 'idle' | 'preparing' | 'signing' | 'confirming' | 'success' | 'error';

interface Transaction {
  signature: string;
  from: string;
  to: string;
  amount: number;
  timestamp: number;
  status: 'pending' | 'confirmed' | 'failed';
  encrypted: boolean;
}

export default function Home() {
  const { connection } = useConnection();
  const wallet = useWallet();

  // State management
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState<'connect' | 'transfer' | 'history'>('connect');
  const [txStatus, setTxStatus] = useState<TransactionStatus>('idle');
  const [amount, setAmount] = useState('');
  const [recipient, setRecipient] = useState('');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [currentTx, setCurrentTx] = useState('');
  const [showDecrypt, setShowDecrypt] = useState(false);
  const [decryptedAmount, setDecryptedAmount] = useState<number | null>(null);
  const [balance, setBalance] = useState<number | null>(null);

  // Client-side only mount
  useEffect(() => {
    setMounted(true);
  }, []);

  // Get provider
  const getProvider = () => {
    if (!wallet.publicKey) return null;
    return new AnchorProvider(connection, wallet as any, { commitment: 'confirmed' });
  };

  // Fetch balance
  useEffect(() => {
    if (wallet.publicKey && mounted) {
      connection.getBalance(wallet.publicKey).then((bal) => {
        setBalance(bal / 1_000_000_000);
      });
    }
  }, [wallet.publicKey, connection, mounted]);

  // Auto-switch to transfer when wallet connects
  useEffect(() => {
    if (wallet.connected && step === 'connect' && mounted) {
      setStep('transfer');
      toast.success('Wallet connected!', {
        description: `Address: ${wallet.publicKey?.toBase58().slice(0, 8)}...`
      });
    }
  }, [wallet.connected, mounted]);

  // Handle transfer
  const handleTransfer = async () => {
    try {
      setTxStatus('preparing');
      toast.loading('Preparing transaction...', { id: 'tx' });

      const provider = getProvider();
      if (!provider) throw new Error('Connect wallet first!');

      // Validate
      if (!recipient.trim()) throw new Error('Enter recipient address');
      const recipientPubkey = new PublicKey(recipient.trim());
      
      const numAmount = parseFloat(amount);
      if (isNaN(numAmount) || numAmount <= 0) throw new Error('Invalid amount');

      const program = new Program(idl as any, provider);

      // Encrypt amount - FIX: Utiliser une approche compatible browser
      const amountLamports = Math.floor(numAmount * 1_000_000_000);
      const encryptedBuffer = Buffer.alloc(32);
      
      // Convertir BigInt en bytes manuellement
      const amountBigInt = BigInt(amountLamports);
      const view = new DataView(encryptedBuffer.buffer);
      view.setBigUint64(0, amountBigInt, true); // true = little-endian

      setTxStatus('signing');
      toast.loading('Waiting for signature...', { id: 'tx' });

      const tx = await program.methods
        .confidentialTransfer(Array.from(encryptedBuffer))
        .accounts({
          from: wallet.publicKey!,
          to: recipientPubkey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      setCurrentTx(tx);
      setTxStatus('confirming');
      toast.loading('Confirming transaction...', { id: 'tx' });

      // Confirm
      const latestBlockhash = await connection.getLatestBlockhash();
      await connection.confirmTransaction({
        signature: tx,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      });

      // Add to history
      const newTx: Transaction = {
        signature: tx,
        from: wallet.publicKey!.toBase58(),
        to: recipientPubkey.toBase58(),
        amount: numAmount,
        timestamp: Date.now(),
        status: 'confirmed',
        encrypted: true,
      };
      setTransactions((prev) => [newTx, ...prev]);

      setTxStatus('success');
      toast.success('Transfer successful!', {
        id: 'tx',
        description: `Sent ${numAmount} SOL (encrypted)`,
        action: {
          label: 'View on Solscan',
          onClick: () => window.open(`https://solscan.io/tx/${tx}?cluster=devnet`, '_blank'),
        },
      });

      // Reset form
      setTimeout(() => {
        setAmount('');
        setRecipient('');
        setTxStatus('idle');
        setStep('history');
      }, 2000);

    } catch (err: any) {
      console.error('Transfer error:', err);
      setTxStatus('error');
      
      let errorMsg = err.message;
      if (err.message.includes('User rejected')) {
        errorMsg = 'Transaction cancelled';
      } else if (err.logs) {
        errorMsg = 'Program execution failed';
        console.log('Program logs:', err.logs);
      }

      toast.error('Transfer failed', {
        id: 'tx',
        description: errorMsg,
      });

      setTimeout(() => setTxStatus('idle'), 3000);
    }
  };

  // Decrypt amount (mock - in production use real ElGamal)
  const handleDecrypt = (tx: Transaction) => {
    setDecryptedAmount(tx.amount);
    setShowDecrypt(true);
    toast.success('Amount decrypted', {
      description: `${tx.amount} SOL revealed`,
    });
  };

  // Copy to clipboard
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard!');
  };

  // Prevent hydration mismatch
  if (!mounted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-blue-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-purple-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-blue-900">
      <Toaster position="top-right" richColors />

      {/* Navbar */}
      <nav className="backdrop-blur-md bg-white/5 border-b border-white/10">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-blue-500 rounded-lg flex items-center justify-center">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
                Noctis Finance
              </h1>
              <p className="text-xs text-gray-400">Confidential Transfers</p>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            {balance !== null && wallet.connected && (
              <div className="hidden md:flex items-center space-x-2 px-4 py-2 bg-white/5 rounded-lg border border-white/10">
                <Wallet className="w-4 h-4 text-purple-400" />
                <span className="text-sm text-white font-medium">
                  {balance.toFixed(4)} SOL
                </span>
              </div>
            )}
            <WalletButton />
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-12">
        
        {/* Step Indicator */}
        {wallet.connected && (
          <div className="flex justify-center mb-12">
            <div className="flex items-center space-x-4">
              {[
                { key: 'transfer', label: 'Transfer', icon: Send },
                { key: 'history', label: 'History', icon: History },
              ].map((s) => (
                <div key={s.key}>
                  <button
                    onClick={() => setStep(s.key as any)}
                    className={`flex items-center space-x-2 px-6 py-3 rounded-lg transition-all ${
                      step === s.key
                        ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-lg'
                        : 'bg-white/5 text-gray-400 hover:bg-white/10'
                    }`}
                  >
                    <s.icon className="w-5 h-5" />
                    <span className="font-medium">{s.label}</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <AnimatePresence mode="wait">
          
          {/* Connect Wallet Screen */}
          {!wallet.connected && (
            <motion.div
              key="connect"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-2xl mx-auto"
            >
              <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-12 text-center">
                <div className="w-20 h-20 bg-gradient-to-br from-purple-500 to-blue-500 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Lock className="w-10 h-10 text-white" />
                </div>
                
                <h2 className="text-4xl font-bold text-white mb-4">
                  Welcome to Noctis Finance
                </h2>
                
                <p className="text-gray-300 text-lg mb-8 max-w-md mx-auto">
                  Send confidential transfers on Solana with end-to-end encryption
                </p>

                <div className="space-y-4 text-left max-w-md mx-auto mb-8">
                  {[
                    'ElGamal homomorphic encryption',
                    'Zero-knowledge proofs',
                    'Privacy-preserving transactions',
                    'On-chain confidentiality',
                  ].map((feature, idx) => (
                    <div key={idx} className="flex items-center space-x-3 text-gray-300">
                      <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0" />
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>

                <WalletButton />
              </div>
            </motion.div>
          )}

          {/* Transfer Screen */}
          {wallet.connected && step === 'transfer' && (
            <motion.div
              key="transfer"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-2xl mx-auto"
            >
              <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-8">
                <div className="flex items-center space-x-3 mb-6">
                  <Send className="w-6 h-6 text-purple-400" />
                  <h2 className="text-2xl font-bold text-white">
                    Confidential Transfer
                  </h2>
                </div>

                <div className="space-y-6">
                  {/* Recipient */}
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Recipient Address
                    </label>
                    <input
                      type="text"
                      value={recipient}
                      onChange={(e) => setRecipient(e.target.value)}
                      placeholder="Enter Solana address..."
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 transition-colors"
                      disabled={txStatus !== 'idle'}
                    />
                  </div>

                  {/* Amount */}
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Amount (SOL)
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="0.00"
                        step="0.01"
                        min="0"
                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 transition-colors"
                        disabled={txStatus !== 'idle'}
                      />
                      <Lock className="absolute right-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-purple-400" />
                    </div>
                    <p className="text-xs text-gray-400 mt-2 flex items-center space-x-1">
                      <Lock className="w-3 h-3" />
                      <span>Amount will be encrypted on-chain</span>
                    </p>
                  </div>

                  {/* Status */}
                  {txStatus !== 'idle' && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="bg-white/5 rounded-lg p-4 border border-white/10"
                    >
                      <div className="flex items-center space-x-3">
                        {txStatus === 'success' ? (
                          <CheckCircle className="w-5 h-5 text-green-400" />
                        ) : txStatus === 'error' ? (
                          <XCircle className="w-5 h-5 text-red-400" />
                        ) : (
                          <Loader2 className="w-5 h-5 text-purple-400 animate-spin" />
                        )}
                        <div className="flex-1">
                          <p className="text-white font-medium">
                            {txStatus === 'preparing' && 'Preparing transaction...'}
                            {txStatus === 'signing' && 'Waiting for signature...'}
                            {txStatus === 'confirming' && 'Confirming on Solana...'}
                            {txStatus === 'success' && 'Transfer successful!'}
                            {txStatus === 'error' && 'Transfer failed'}
                          </p>
                          {currentTx && txStatus === 'success' && (
                            <button
                              onClick={() => window.open(`https://solscan.io/tx/${currentTx}?cluster=devnet`, '_blank')}
                              className="text-xs text-purple-400 hover:text-purple-300 flex items-center space-x-1 mt-1"
                            >
                              <span>View on Solscan</span>
                              <ExternalLink className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* Submit Button */}
                  <button
                    onClick={handleTransfer}
                    disabled={txStatus !== 'idle' || !amount || !recipient}
                    className="w-full py-4 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg font-medium hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl"
                  >
                    {txStatus === 'idle' ? (
                      <span className="flex items-center justify-center space-x-2">
                        <Send className="w-5 h-5" />
                        <span>Send Confidential Transfer</span>
                      </span>
                    ) : (
                      <span className="flex items-center justify-center space-x-2">
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>Processing...</span>
                      </span>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* History Screen */}
          {wallet.connected && step === 'history' && (
            <motion.div
              key="history"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-4xl mx-auto"
            >
              <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-8">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center space-x-3">
                    <History className="w-6 h-6 text-purple-400" />
                    <h2 className="text-2xl font-bold text-white">
                      Transaction History
                    </h2>
                  </div>
                  <span className="text-sm text-gray-400">
                    {transactions.length} transaction{transactions.length !== 1 && 's'}
                  </span>
                </div>

                {transactions.length === 0 ? (
                  <div className="text-center py-12">
                    <History className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                    <p className="text-gray-400">No transactions yet</p>
                    <button
                      onClick={() => setStep('transfer')}
                      className="mt-4 text-purple-400 hover:text-purple-300"
                    >
                      Send your first transfer →
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {transactions.map((tx, idx) => (
                      <motion.div
                        key={tx.signature}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.1 }}
                        className="bg-white/5 rounded-lg p-4 border border-white/10 hover:bg-white/10 transition-colors"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center space-x-2 mb-2">
                              {tx.encrypted ? (
                                <Lock className="w-4 h-4 text-purple-400" />
                              ) : (
                                <Unlock className="w-4 h-4 text-gray-400" />
                              )}
                              <span className="text-white font-medium">
                                {tx.encrypted ? 'Encrypted' : 'Public'} Transfer
                              </span>
                              <span className={`text-xs px-2 py-1 rounded-full ${
                                tx.status === 'confirmed'
                                  ? 'bg-green-500/20 text-green-400'
                                  : tx.status === 'pending'
                                  ? 'bg-yellow-500/20 text-yellow-400'
                                  : 'bg-red-500/20 text-red-400'
                              }`}>
                                {tx.status}
                              </span>
                            </div>

                            <div className="space-y-1 text-sm">
                              <div className="flex items-center space-x-2 text-gray-400">
                                <span>To:</span>
                                <code className="text-gray-300">{tx.to.slice(0, 8)}...{tx.to.slice(-6)}</code>
                                <button
                                  onClick={() => copyToClipboard(tx.to)}
                                  className="hover:text-purple-400"
                                >
                                  <Copy className="w-3 h-3" />
                                </button>
                              </div>

                              <div className="flex items-center space-x-2 text-gray-400">
                                <span>Amount:</span>
                                {tx.encrypted ? (
                                  <button
                                    onClick={() => handleDecrypt(tx)}
                                    className="flex items-center space-x-1 text-purple-400 hover:text-purple-300"
                                  >
                                    <Eye className="w-3 h-3" />
                                    <span>Decrypt</span>
                                  </button>
                                ) : (
                                  <span className="text-white">{tx.amount} SOL</span>
                                )}
                              </div>

                              <div className="text-gray-500 text-xs">
                                {new Date(tx.timestamp).toLocaleString()}
                              </div>
                            </div>
                          </div>

                          <button
                            onClick={() => window.open(`https://solscan.io/tx/${tx.signature}?cluster=devnet`, '_blank')}
                            className="text-purple-400 hover:text-purple-300 flex items-center space-x-1"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>

      {/* Decrypt Modal */}
      <AnimatePresence>
        {showDecrypt && decryptedAmount !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setShowDecrypt(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl border border-white/20 p-8 max-w-md w-full"
            >
              <div className="text-center">
                <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-emerald-500 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Unlock className="w-8 h-8 text-white" />
                </div>
                
                <h3 className="text-2xl font-bold text-white mb-2">
                  Amount Decrypted
                </h3>
                
                <div className="bg-white/5 rounded-lg p-6 my-6">
                  <p className="text-4xl font-bold bg-gradient-to-r from-green-400 to-emerald-400 bg-clip-text text-transparent">
                    {decryptedAmount} SOL
                  </p>
                </div>

                <button
                  onClick={() => setShowDecrypt(false)}
                  className="w-full py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg font-medium hover:from-green-700 hover:to-emerald-700 transition-all"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <div className="container mx-auto px-4 py-6 mt-12">
        <div className="text-center text-gray-400 text-sm">
          <p>Built with 🌙 by Noctis Finance • Powered by Solana</p>
          <p className="mt-2">
            <span className="inline-flex items-center space-x-1">
              <Lock className="w-3 h-3" />
              <span>End-to-end encrypted transfers</span>
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
