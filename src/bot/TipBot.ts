import TelegramBot from 'node-telegram-bot-api';
import { config } from '../config';
import { TipRequest, UserWallet, TipTransaction } from '../types';
import { TipService } from '../services/TipService';
import { WalletManager } from '../ton/WalletManager';
import { CallbackHandler } from './CallbackHandler';

export class TipBot {
  private bot: TelegramBot;
  private tipService: TipService;
  private walletManager: WalletManager;
  private callbackHandler: CallbackHandler;
  private activeTips = new Map<string, TipRequest>();

  constructor() {
    this.bot = new TelegramBot(config.token, { polling: true });
    this.tipService = new TipService();
    this.walletManager = new WalletManager();
    this.callbackHandler = new CallbackHandler(this.bot, this.tipService);
    this.setupCommands();
    this.setupHandlers();
  }

  private setupCommands() {
    this.bot.setMyCommands([
      { command: 'start', description: 'Start the bot' },
      { command: 'wallet', description: 'Wallet status' },
      { command: 'connect', description: 'Connect TON wallet' },
      { command: 'tip', description: 'Send tip - /tip @username amount' },
      { command: 'balance', description: 'View balance' },
      { command: 'help', description: 'Help' }
    ]);
  }

  private setupHandlers() {
    // Start command
    this.bot.onText(/\/start/, async (msg) => {
      const chatId = msg.chat.id;
      const welcomeText = `
🎯 **Welcome to TON Tip Bot!**

Easily send TON tips in Telegram groups:

🔹 \`/tip @username 1\` - Send 1 TON tip to user
🔹 \`/connect\` - Connect your wallet  
🔹 \`/balance\` - Check your balance

Bot works in groups and provides public tipping!
      `;
      
      await this.bot.sendMessage(chatId, welcomeText, { parse_mode: 'Markdown' });
    });

    // Wallet connection
    this.bot.onText(/\/connect/, async (msg) => {
      const userId = msg.from?.id!;
      const chatId = msg.chat.id;
      
      try {
        const connectUrl = await this.walletManager.connectWallet(userId);
        
        const keyboard = {
          inline_keyboard: [[
            { text: '🔗 Connect TON Wallet', url: connectUrl }
          ]]
        };
        
        await this.bot.sendMessage(
          chatId, 
          '👛 Click the button to connect your TON wallet:', 
          { reply_markup: keyboard }
        );
      } catch (error) {
        await this.bot.sendMessage(chatId, '❌ Wallet connection failed!');
      }
    });

    // Tip komutu - /tip @username amount
    this.bot.onText(/\/tip @?(\w+) (\d+(?:\.\d+)?)/, async (msg, match) => {
      if (!msg.from || !match) return;
      
      const fromUserId = msg.from.id;
      const toUsername = match[1];
      const amount = parseFloat(match[2]);
      const chatId = msg.chat.id;
      const messageId = msg.message_id;
      
      // Amount validation
      if (amount <= 0 || amount > 100) {
        await this.bot.sendMessage(chatId, '❌ Invalid amount! (0.1-100 TON range)', { 
          reply_to_message_id: messageId 
        });
        return;
      }
      
      // Self-tip check  
      if (msg.from.username === toUsername) {
        await this.bot.sendMessage(chatId, '🤔 You cannot tip yourself!', {
          reply_to_message_id: messageId
        });
        return;
      }
      
      await this.processTip(fromUserId, toUsername, amount, chatId, messageId);
    });

    // Balance command
    this.bot.onText(/\/balance/, async (msg) => {
      const userId = msg.from?.id!;
      const chatId = msg.chat.id;
      
      const wallet = await this.walletManager.getWalletInfo(userId);
      if (!wallet || !wallet.isConnected) {
        await this.bot.sendMessage(chatId, '❌ Please connect your wallet first: /connect');
        return;
      }
      
      const balance = await this.walletManager.getBalance(wallet.walletAddress!);
      const stats = await this.tipService.getUserStats(userId);
      
      const balanceText = `
💰 **Wallet Status**

🏦 Balance: ${balance.toFixed(2)} TON
📤 Sent: ${stats.totalSent.toFixed(2)} TON
📥 Received: ${stats.totalReceived.toFixed(2)} TON
🔄 Transactions: ${stats.transactionCount}
      `;
      
      await this.bot.sendMessage(chatId, balanceText, { parse_mode: 'Markdown' });
    });

    // Help command
    this.bot.onText(/\/help/, async (msg) => {
      const helpText = `
📖 **TON Tip Bot Commands:**

🔸 \`/tip @username amount\` - Send tip
🔸 \`/connect\` - Connect wallet  
🔸 \`/balance\` - Show balance
🔸 \`/wallet\` - Wallet status

**Usage Examples:**
• \`/tip @john 0.5\` - Send 0.5 TON to John
• \`/tip @alice 2\` - Send 2 TON to Alice

💡 Bot works only in groups!
      `;
      
      await this.bot.sendMessage(msg.chat.id, helpText, { parse_mode: 'Markdown' });
    });

    // Hata yakalama
    this.bot.on('error', (error) => {
      console.error('Bot Error:', error);
    });
  }

  private async processTip(
    fromUserId: number, 
    toUsername: string, 
    amount: number, 
    chatId: number, 
    messageId: number
  ) {
    try {
      // Sender wallet check
      const senderWallet = await this.walletManager.getWalletInfo(fromUserId);
      if (!senderWallet || !senderWallet.isConnected) {
        await this.bot.sendMessage(chatId, '❌ Please connect your wallet first: /connect', {
          reply_to_message_id: messageId
        });
        return;
      }

      // Balance check
      const balance = await this.walletManager.getBalance(senderWallet.walletAddress!);
      if (balance < amount) {
        await this.bot.sendMessage(chatId, '❌ Insufficient balance!', {
          reply_to_message_id: messageId
        });
        return;
      }

      // Tip onay butonu
      const keyboard = {
        inline_keyboard: [[
          { text: '✅ Onayla', callback_data: `confirm_tip_${fromUserId}_${toUsername}_${amount}` },
          { text: '❌ İptal', callback_data: `cancel_tip_${fromUserId}` }
        ]]
      };

      await this.bot.sendMessage(
        chatId,
        `💸 **Tip Confirmation**\n\nDo you want to send ${amount} TON to @${toUsername}?\n\n⏰ Please confirm within 30 seconds.`,
        {
          reply_markup: keyboard,
          parse_mode: 'Markdown',
          reply_to_message_id: messageId
        }
      );

    } catch (error) {
      console.error('Tip process error:', error);
      await this.bot.sendMessage(chatId, '❌ Tip could not be sent. Please try again.', {
        reply_to_message_id: messageId
      });
    }
  }

  public async start() {
    console.log('🚀 TON Tip Bot started!');
    console.log(`📱 Bot username: @${(await this.bot.getMe()).username}`);
  }
}