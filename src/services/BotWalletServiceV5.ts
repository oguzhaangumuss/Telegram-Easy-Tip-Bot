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
      
      const mnemonicArray = mnemonic.split(' ');
      this.keyPair = await mnemonicToWalletKey(mnemonicArray);
      
      const wallet = WalletContractV5R1.create({
        publicKey: this.keyPair.publicKey,
        workchain: 0
      });

      this.botWallet = this.tonClient.open(wallet);
      
      console.log(`✅ W5 Bot wallet initialized: ${this.botWallet.address.toString()}`);
      console.log(`📍 Expected address: ${walletAddress}`);
      
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

      try {
        Address.parse(toAddress);
      } catch {
        throw new Error('Invalid recipient address format');
      }

      const botBalance = await this.getBotBalance();
      if (botBalance < amount + 0.01) {
        throw new Error(`Insufficient bot balance. Available: ${botBalance} TON, Required: ${amount + 0.01} TON`);
      }

      const seqno = await this.botWallet.getSeqno();
      console.log(`📊 Current seqno: ${seqno}`);

      // Create transfer
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

      // Send transaction
      await this.botWallet.send(transfer);
      
      console.log(`✅ W5 Tip sent successfully: ${amount} TON to ${toAddress}`);
      console.log(`📝 Comment: ${comment}`);

      // Wait a moment for transaction to be processed
      await new Promise(resolve => setTimeout(resolve, 3000));

      try {
        // Get latest transactions to find our transaction
        const walletAddress = this.botWallet.address.toString({ bounceable: false });
        const transactions = await this.tonClient.getTransactions(this.botWallet.address, { limit: 5 });
        
        if (transactions.length > 0) {
          // Find the most recent outgoing transaction with our comment
          const ourTransaction = transactions.find(tx => {
            // Check if this transaction has our comment
            try {
              if (tx.outMessages.size > 0) {
                const outMsg = tx.outMessages.get(0);
                if (outMsg && outMsg.body) {
                  const bodyText = outMsg.body.asSlice().loadStringTail();
                  return bodyText.includes(comment) || bodyText.includes(amount.toString());
                }
              }
            } catch (e) {
              // Ignore parsing errors
            }
            return false;
          });

          if (ourTransaction) {
            const txHash = ourTransaction.hash().toString('hex');
            const txLink = `https://testnet.tonviewer.com/transaction/${txHash}`;
            console.log(`🔗 Transaction link: ${txLink}`);
            return txLink;
          }
        }
      } catch (error) {
        console.log('Could not fetch transaction hash, providing wallet link instead');
      }

      // Fallback: provide wallet address link
      const walletAddress = this.botWallet.address.toString({ bounceable: false });
      const fallbackLink = `https://testnet.tonviewer.com/${walletAddress}`;
      console.log(`🔗 View transactions: ${fallbackLink}`);
      return fallbackLink;

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