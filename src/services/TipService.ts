import { TipTransaction, TipRequest } from '../types';
import { WalletManager } from '../ton/WalletManager';

export class TipService {
  private walletManager: WalletManager;
  private transactions = new Map<string, TipTransaction>();
  private pendingTips = new Map<string, TipRequest>();

  constructor() {
    this.walletManager = new WalletManager();
  }

  async processTip(request: TipRequest): Promise<TipTransaction> {
    const transactionId = this.generateTransactionId();
    
    const transaction: TipTransaction = {
      id: transactionId,
      fromUserId: request.fromUserId,
      toUserId: request.toUserId,
      amount: request.amount,
      chatId: request.chatId,
      timestamp: new Date(),
      status: 'pending'
    };

    try {
      // Gönderici cüzdan bilgisi al
      const senderWallet = await this.walletManager.getWalletInfo(request.fromUserId);
      if (!senderWallet || !senderWallet.isConnected) {
        transaction.status = 'failed';
        throw new Error('Sender wallet not connected');
      }

      // Get receiver wallet info
      const receiverWallet = await this.walletManager.getWalletInfo(request.toUserId);
      if (!receiverWallet || !receiverWallet.isConnected) {
        transaction.status = 'failed';
        throw new Error('Receiver wallet not connected');
      }

      // Balance check
      const balance = await this.walletManager.getBalance(senderWallet.walletAddress!);
      if (balance < request.amount) {
        transaction.status = 'failed';
        throw new Error('Insufficient balance');
      }

      // Start TON transfer
      const txHash = await this.walletManager.sendTon(
        senderWallet.walletAddress!,
        receiverWallet.walletAddress!,
        request.amount
      );

      transaction.txHash = txHash;
      transaction.status = 'completed';

    } catch (error) {
      console.error('Tip processing error:', error);
      transaction.status = 'failed';
    }

    this.transactions.set(transactionId, transaction);
    return transaction;
  }

  async getTipHistory(userId: number): Promise<TipTransaction[]> {
    return Array.from(this.transactions.values())
      .filter(tx => tx.fromUserId === userId || tx.toUserId === userId)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  async getTransaction(transactionId: string): Promise<TipTransaction | null> {
    return this.transactions.get(transactionId) || null;
  }

  addPendingTip(key: string, request: TipRequest): void {
    this.pendingTips.set(key, request);
    
    // Auto cleanup after 5 minutes
    setTimeout(() => {
      this.pendingTips.delete(key);
    }, 5 * 60 * 1000);
  }

  getPendingTip(key: string): TipRequest | null {
    return this.pendingTips.get(key) || null;
  }

  removePendingTip(key: string): void {
    this.pendingTips.delete(key);
  }

  async getUserStats(userId: number): Promise<{
    totalSent: number;
    totalReceived: number;
    transactionCount: number;
  }> {
    const userTransactions = await this.getTipHistory(userId);
    
    const stats = {
      totalSent: 0,
      totalReceived: 0,
      transactionCount: userTransactions.length
    };

    userTransactions.forEach(tx => {
      if (tx.status === 'completed') {
        if (tx.fromUserId === userId) {
          stats.totalSent += tx.amount;
        } else {
          stats.totalReceived += tx.amount;
        }
      }
    });

    return stats;
  }

  private generateTransactionId(): string {
    return `tip_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async getTopTippers(limit: number = 10): Promise<Array<{
    userId: number;
    totalSent: number;
    tipCount: number;
  }>> {
    const userStats = new Map<number, { totalSent: number; tipCount: number }>();

    Array.from(this.transactions.values())
      .filter(tx => tx.status === 'completed')
      .forEach(tx => {
        const existing = userStats.get(tx.fromUserId) || { totalSent: 0, tipCount: 0 };
        existing.totalSent += tx.amount;
        existing.tipCount += 1;
        userStats.set(tx.fromUserId, existing);
      });

    return Array.from(userStats.entries())
      .map(([userId, stats]) => ({ userId, ...stats }))
      .sort((a, b) => b.totalSent - a.totalSent)
      .slice(0, limit);
  }
}