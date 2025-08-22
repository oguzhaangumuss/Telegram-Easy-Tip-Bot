import { Address } from '@ton/core';
import { TonClient } from '@ton/ton';
import { UserWallet } from '../types';
import { BotWalletService } from '../services/BotWalletService';

export class WalletManager {
  private tonClient: TonClient;
  private connectedWallets = new Map<number, UserWallet>();
  private botWalletService: BotWalletService;

  constructor() {
    // Initialize TON client for testnet
    this.tonClient = new TonClient({
      endpoint: 'https://testnet.toncenter.com/api/v2/jsonRPC',
      apiKey: process.env.TON_API_KEY
    });
    
    this.botWalletService = new BotWalletService();
    this.initializeBotWallet();
  }

  private async initializeBotWallet() {
    try {
      const botMnemonic = process.env.BOT_WALLET_MNEMONIC;
      const botWalletAddress = process.env.BOT_WALLET_ADDRESS;
      
      if (botMnemonic && botWalletAddress) {
        await this.botWalletService.initialize(botMnemonic, botWalletAddress);
        console.log('🤖 Bot wallet initialized successfully');
      } else {
        console.warn('⚠️  Bot wallet not configured. Tips will be simulated.');
      }
    } catch (error) {
      console.error('❌ Bot wallet initialization failed:', error);
    }
  }

  async connectWallet(userId: number, walletAddress: string): Promise<boolean> {
    try {
      // Validate TON address
      if (!this.isValidTonAddress(walletAddress)) {
        throw new Error('Invalid TON address format');
      }

      // Get real balance from blockchain
      const balance = await this.getBalance(walletAddress);
      
      const wallet: UserWallet = {
        userId,
        walletAddress,
        isConnected: true,
        balance
      };

      this.connectedWallets.set(userId, wallet);
      console.log(`Wallet connected: ${walletAddress} with balance: ${balance} TON`);
      return true;

    } catch (error) {
      console.error('Wallet connection error:', error);
      throw new Error(`Wallet connection failed: ${error}`);
    }
  }

  async disconnectWallet(userId: number): Promise<void> {
    this.connectedWallets.delete(userId);
    console.log(`Wallet disconnected for user: ${userId}`);
  }

  async getWalletInfo(userId: number): Promise<UserWallet | null> {
    return this.connectedWallets.get(userId) || null;
  }

  async getBalance(walletAddress: string): Promise<number> {
    try {
      const address = Address.parse(walletAddress);
      const balance = await this.tonClient.getBalance(address);
      
      // Convert from nanoTON to TON
      const balanceInTon = Number(balance) / 1e9;
      console.log(`Balance for ${walletAddress}: ${balanceInTon} TON`);
      return balanceInTon;
    } catch (error) {
      console.error('Balance fetch error:', error);
      throw new Error(`Failed to get balance: ${error}`);
    }
  }

  async sendTon(
    fromUserId: number,
    toAddress: string, 
    amount: number,
    comment: string = ''
  ): Promise<string> {
    try {
      // Validate recipient address
      if (!this.isValidTonAddress(toAddress)) {
        throw new Error('Invalid recipient TON address');
      }

      // Check if bot wallet is initialized
      if (!(await this.botWalletService.isInitialized())) {
        throw new Error('Bot wallet not configured');
      }

      // Check bot wallet balance
      const botBalance = await this.botWalletService.getBotBalance();
      if (botBalance < amount + 0.01) { // Include gas fees
        throw new Error(`Insufficient bot balance. Available: ${botBalance} TON, Required: ${amount + 0.01} TON`);
      }

      // Send tip from bot wallet to recipient
      const txHash = await this.botWalletService.sendTip(toAddress, amount, comment);
      
      console.log(`✅ Tip sent successfully: ${amount} TON to ${toAddress}`);
      console.log(`🔗 Transaction: ${txHash}`);
      
      return txHash;

    } catch (error) {
      console.error('TON transfer error:', error);
      throw error;
    }
  }

  isValidTonAddress(address: string): boolean {
    try {
      Address.parse(address);
      return true;
    } catch {
      return false;
    }
  }

  getAllConnectedWallets(): UserWallet[] {
    return Array.from(this.connectedWallets.values());
  }
}