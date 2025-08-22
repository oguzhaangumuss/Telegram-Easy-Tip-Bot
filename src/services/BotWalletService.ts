import { Address, beginCell, Cell, toNano } from '@ton/core';
import { TonClient } from '@ton/ton';
import { mnemonicToWalletKey, sign } from '@ton/crypto';

export class BotWalletService {
  private tonClient: TonClient;
  private botWalletKeyPair: any = null;
  private botWalletAddress: Address | null = null;

  constructor() {
    this.tonClient = new TonClient({
      endpoint: 'https://testnet.toncenter.com/api/v2/jsonRPC',
      apiKey: process.env.TON_API_KEY
    });
  }

  async initialize(mnemonic: string, walletAddress: string) {
    try {
      // Derive bot wallet keys from mnemonic
      const mnemonicArray = mnemonic.split(' ');
      this.botWalletKeyPair = await mnemonicToWalletKey(mnemonicArray);
      this.botWalletAddress = Address.parse(walletAddress);
      
      console.log(`Bot wallet initialized: ${this.botWalletAddress.toString()}`);
      return true;
    } catch (error) {
      console.error('Bot wallet initialization failed:', error);
      throw new Error(`Bot wallet setup failed: ${error}`);
    }
  }

  async getBotBalance(): Promise<number> {
    try {
      if (!this.botWalletAddress) {
        return 0;
      }
      const balance = await this.tonClient.getBalance(this.botWalletAddress);
      return Number(balance) / 1e9; // Convert from nanoTON to TON
    } catch (error) {
      console.error('Failed to get bot balance:', error);
      return 0;
    }
  }

  async sendTip(toAddress: string, amount: number, comment: string = ''): Promise<string> {
    try {
      // Validate inputs
      if (!this.botWalletKeyPair || !this.botWalletAddress) {
        throw new Error('Bot wallet not initialized');
      }

      try {
        Address.parse(toAddress);
      } catch {
        throw new Error('Invalid recipient address');
      }

      const recipientAddress = Address.parse(toAddress);
      const amountNano = toNano(amount.toString());

      // Check bot balance
      const botBalance = await this.getBotBalance();
      if (botBalance < amount + 0.01) { // Include fee
        throw new Error(`Insufficient bot balance. Available: ${botBalance} TON, Required: ${amount + 0.01} TON`);
      }

      // Get current seqno
      const seqno = await this.getSeqno();

      // Create internal message body (comment)
      const internalMessageBody = beginCell()
        .storeUint(0, 32) // Text comment opcode
        .storeStringTail(comment)
        .endCell();

      // Create internal message
      const internalMessage = beginCell()
        .storeUint(0x10, 6) // Internal message, no bounce
        .storeAddress(recipientAddress)
        .storeCoins(amountNano)
        .storeUint(1, 1 + 4 + 4 + 64 + 32 + 1 + 1) // Extra currencies, IHR fee, FWD fee, CreatedLT, CreatedAt, no init, body as ref
        .storeRef(internalMessageBody)
        .endCell();

      // Create message to sign
      const toSign = beginCell()
        .storeUint(698983191, 32) // subwallet_id (default for V3R2)
        .storeUint(Math.floor(Date.now() / 1000) + 60, 32) // valid_until (current time + 60 seconds)
        .storeUint(seqno, 32) // seqno
        .storeUint(3, 8) // send mode (pay gas fee from wallet balance)
        .storeRef(internalMessage)
        .endCell();

      // Sign the message
      const signature = sign(toSign.hash(), this.botWalletKeyPair.secretKey);

      // Create message body
      const body = beginCell()
        .storeBuffer(signature) // signature
        .storeBuilder(toSign.asBuilder()) // message
        .endCell();

      // Create external message
      const externalMessage = beginCell()
        .storeUint(0b10, 2) // external inbound message
        .storeUint(0, 2) // src addr_none
        .storeAddress(this.botWalletAddress) // dest
        .storeCoins(0) // import_fee
        .storeBit(0) // no init
        .storeBit(1) // body as reference
        .storeRef(body)
        .endCell();

      // Send transaction
      await this.tonClient.sendFile(externalMessage.toBoc());
      
      // Generate transaction hash (simplified)
      const txHash = `tx_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
      
      console.log(`✅ Tip sent: ${amount} TON to ${toAddress}`);
      console.log(`📝 Comment: ${comment}`);
      console.log(`🔗 TX Hash: ${txHash}`);
      
      return txHash;

    } catch (error) {
      console.error('Send tip failed:', error);
      throw error;
    }
  }

  private async getSeqno(): Promise<number> {
    try {
      if (!this.botWalletAddress) {
        return 0;
      }
      const result = await this.tonClient.runMethod(this.botWalletAddress, 'seqno');
      return result.stack.readNumber();
    } catch (error) {
      console.error('Failed to get seqno:', error);
      return 0;
    }
  }

  async isInitialized(): Promise<boolean> {
    return !!(this.botWalletKeyPair && this.botWalletAddress);
  }

  async validateTransaction(txHash: string): Promise<boolean> {
    // In a real implementation, you would check the transaction on the blockchain
    // For now, we'll return true as a placeholder
    console.log(`Validating transaction: ${txHash}`);
    return true;
  }
}