export interface TipRequest {
  fromUserId: number;
  toUserId: number;
  toUsername?: string;
  directAddress?: string;
  amount: number;
  chatId: number;
  messageId: number;
}

export interface UserWallet {
  userId: number;
  walletAddress?: string;
  isConnected: boolean;
  balance?: number;
}

export interface TipTransaction {
  id: string;
  fromUserId: number;
  toUserId: number;
  amount: number;
  chatId: number;
  timestamp: Date;
  txHash?: string;
  status: 'pending' | 'completed' | 'failed';
}

export interface BotConfig {
  token: string;
  isTestnet: boolean;
  adminChatId?: number;
}