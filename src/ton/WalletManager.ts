import { Address } from '@ton/core';
import { TonClient } from '@ton/ton';
import { UserWallet } from '../types';

export class WalletManager {
  private tonClient: TonClient;
  private connectedWallets = new Map<number, UserWallet>();

  constructor() {
    // Initialize TON client for testnet
    this.tonClient = new TonClient({
      endpoint: 'https://testnet.toncenter.com/api/v2/jsonRPC',
      apiKey: process.env.TON_API_KEY
    });
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
    fromAddress: string, 
    toAddress: string, 
    amount: number
  ): Promise<string> {
    try {
      // Validate addresses
      if (!this.isValidTonAddress(fromAddress) || !this.isValidTonAddress(toAddress)) {
        throw new Error('Invalid TON address');
      }

      // Check sender balance
      const balance = await this.getBalance(fromAddress);
      if (balance < amount) {
        throw new Error(`Insufficient balance. Available: ${balance} TON, Required: ${amount} TON`);
      }

      // For now, this is a placeholder - in production you need:
      // 1. Private key management
      // 2. Transaction signing
      // 3. Broadcasting to network
      console.log(`TON Transfer initiated: ${amount} TON from ${fromAddress} to ${toAddress}`);
      
      // Return a temporary transaction ID
      // In production, this should be the actual transaction hash
      throw new Error('Transaction signing not implemented - requires private key integration');

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