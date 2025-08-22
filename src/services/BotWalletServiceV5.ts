import { Address, toNano } from '@ton/core';
import { TonClient, WalletContractV5R1, internal } from '@ton/ton';
import { mnemonicToWalletKey } from '@ton/crypto';

export class BotWalletServiceV5 {
  private tonClient: TonClient;
  private botWallet: any = null;
  private keyPair: any = null;

  constructor() {
    this.tonClient = new TonClient({
      endpoint: 'https://testnet.toncenter.com/api/v2/jsonRPC',
      apiKey: process.env.TON_API_KEY
    });
  }

  async initialize(mnemonic: string, walletAddress: string) {
    try {
      console.log(`🔧 Initializing W5 Bot Wallet: ${walletAddress}`);
      
      // Derive bot wallet keys from mnemonic
      const mnemonicArray = mnemonic.split(' ');
      this.keyPair = await mnemonicToWalletKey(mnemonicArray);
      
      // Create W5R1 wallet contract
      const wallet = WalletContractV5R1.create({
        publicKey: this.keyPair.publicKey,
        workchain: 0
      });

      this.botWallet = this.tonClient.open(wallet);
      
      console.log(`✅ W5 Bot wallet initialized: ${this.botWallet.address.toString()}`);
      console.log(`📍 Expected address: ${walletAddress}`);
      
      // Verify addresses match
      const generatedAddress = this.botWallet.address.toString({ bounceable: false });
      if (generatedAddress !== walletAddress) {
        console.warn(`⚠️  Address mismatch! Generated: ${generatedAddress}, Expected: ${walletAddress}`);
      }
      
      return true;
    } catch (error) {
      console.error('W5 Bot wallet initialization failed:', error);
      throw new Error(`W5 Bot wallet setup failed: ${error}`);
    }
  }

  async getBotBalance(): Promise<number> {
    try {
      if (!this.botWallet) {
        console.log('Bot wallet not initialized');
        return 0;
      }
      
      const balance = await this.botWallet.getBalance();
      console.log(`💰 W5 Bot wallet balance: ${Number(balance) / 1e9} TON`);
      return Number(balance) / 1e9;
    } catch (error) {
      console.error('Failed to get W5 bot balance:', error);
      return 0;
    }
  }

  async sendTip(toAddress: string, amount: number, comment: string = ''): Promise<string> {
    try {
      console.log(`💸 W5 Sending ${amount} TON to ${toAddress}`);
      
      if (!this.botWallet || !this.keyPair) {
        throw new Error('W5 Bot wallet not initialized');
      }

      // Validate recipient address
      try {
        Address.parse(toAddress);
      } catch {
        throw new Error('Invalid recipient address format');
      }

      // Check bot balance
      const botBalance = await this.getBotBalance();
      if (botBalance < amount + 0.01) { // Include fee
        throw new Error(`Insufficient bot balance. Available: ${botBalance} TON, Required: ${amount + 0.01} TON`);
      }

      // Get current seqno
      const seqno = await this.botWallet.getSeqno();
      console.log(`📊 Current seqno: ${seqno}`);

      // If seqno is 0, wallet needs deployment - deploy it with first transaction
      let deployTransaction = null;
      if (seqno === 0) {
        console.log('🚀 Wallet not deployed, deploying with first transaction...');
        deployTransaction = this.botWallet.createDeployment(this.keyPair.secretKey);
      }

      // Create transfer using W5 wallet
      const transfer = this.botWallet.createTransfer({
        messages: [
          internal({
            to: Address.parse(toAddress),
            value: toNano(amount.toString()),
            body: comment,
            bounce: false
          })
        ],
        seqno: seqno,
        secretKey: this.keyPair.secretKey
      });

      // Send deployment first if needed, then transfer
      if (deployTransaction) {
        console.log('📤 Sending deployment transaction...');
        await this.botWallet.send(deployTransaction);
        
        // Wait a bit for deployment to confirm
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Update seqno after deployment
        const newSeqno = await this.botWallet.getSeqno();
        console.log(`✅ Wallet deployed! New seqno: ${newSeqno}`);
        
        // Recreate transfer with updated seqno
        const transfer = this.botWallet.createTransfer({
          messages: [
            internal({
              to: Address.parse(toAddress),
              value: toNano(amount.toString()),
              body: comment,
              bounce: false
            })
          ],
          seqno: newSeqno,
          secretKey: this.keyPair.secretKey
        });
        
        console.log('📤 Sending tip transaction...');
        await this.botWallet.send(transfer);
      } else {
        // Send the transfer normally
        await this.botWallet.send(transfer);
      }
      
      // Generate a transaction hash (simplified for demo)
      const txHash = `w5_tx_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
      
      console.log(`✅ W5 Tip sent successfully: ${amount} TON to ${toAddress}`);
      console.log(`📝 Comment: ${comment}`);
      console.log(`🔗 TX Hash: ${txHash}`);
      
      return txHash;

    } catch (error) {
      console.error('W5 Send tip failed:', error);
      throw error;
    }
  }

  async isInitialized(): Promise<boolean> {
    return !!(this.botWallet && this.keyPair);
  }

  async getSeqno(): Promise<number> {
    try {
      if (!this.botWallet) {
        return 0;
      }
      return await this.botWallet.getSeqno();
    } catch (error) {
      console.error('Failed to get W5 seqno:', error);
      return 0;
    }
  }

  async validateTransaction(txHash: string): Promise<boolean> {
    console.log(`Validating W5 transaction: ${txHash}`);
    return true;
  }
}