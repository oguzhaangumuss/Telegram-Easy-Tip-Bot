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
    this.callbackHandler = new CallbackHandler(this.bot, this.tipService, this.walletManager);
    this.setupCommands();
    this.setupHandlers();
  }

  private setupCommands() {
    this.bot.setMyCommands([
      { command: 'start', description: 'Start the bot' },
      { command: 'wallet', description: 'Wallet status' },
      { command: 'connect', description: 'Connect TON wallet - /connect ADDRESS' },
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

Send TON tips easily in Telegram:

🔹 \`/tip @username 1\` - Tip to registered user
🔹 \`/tip EQD4FPq...c3f 1\` - Tip to any wallet
🔹 \`/connect ADDRESS\` - Connect your wallet  
🔹 \`/balance\` - Check your balance

💡 **Two ways to tip:**
• To @username (must be registered)
• To any TON wallet address (no registration needed)

Bot works everywhere! 🚀
      `;
      
      await this.bot.sendMessage(chatId, welcomeText, { parse_mode: 'Markdown' });
    });

    // Wallet connection - /connect ADDRESS
    this.bot.onText(/\/connect (.+)/, async (msg, match) => {
      const userId = msg.from?.id!;
      const chatId = msg.chat.id;
      const walletAddress = match?.[1]?.trim();
      
      if (!walletAddress) {
        await this.bot.sendMessage(
          chatId, 
          '❌ Please provide your wallet address:\n`/connect EQD4FPq...`',
          { parse_mode: 'Markdown' }
        );
        return;
      }
      
      try {
        await this.walletManager.connectWallet(userId, walletAddress);
        await this.bot.sendMessage(
          chatId, 
          `✅ Wallet connected successfully!\n📍 Address: \`${walletAddress}\``,
          { parse_mode: 'Markdown' }
        );
      } catch (error) {
        await this.bot.sendMessage(
          chatId, 
          `❌ Wallet connection failed: ${error}`
        );
      }
    });

    // Connect command without address
    this.bot.onText(/\/connect$/, async (msg) => {
      const chatId = msg.chat.id;
      await this.bot.sendMessage(
        chatId, 
        '👛 To connect your wallet, use:\n`/connect YOUR_WALLET_ADDRESS`\n\nExample:\n`/connect EQD4FPq-sb2q4Jav1Nqk5xGb0WKs5iMuYX8ZsNBNW7Ww_c3f`',
        { parse_mode: 'Markdown' }
      );
    });

    // Tip command - supports both @username and wallet address
    // /tip @username amount OR /tip wallet_address amount
    this.bot.onText(/\/tip (@?\w+|[0-9A-Za-z_-]{48}|EQ[0-9A-Za-z_-]{46}) (\d+(?:\.\d+)?)/, async (msg, match) => {
      if (!msg.from || !match) return;
      
      const fromUserId = msg.from.id;
      const recipient = match[1];
      const amount = parseFloat(match[2]);
      const chatId = msg.chat.id;
      const messageId = msg.message_id;
      
      // Amount validation
      if (amount <= 0 || amount > 100) {
        await this.bot.sendMessage(chatId, '❌ Invalid amount! (0.01-100 TON range)', { 
          reply_to_message_id: messageId 
        });
        return;
      }
      
      // Determine if recipient is username or wallet address
      const isWalletAddress = recipient.startsWith('EQ') || recipient.length === 48;
      const isUsername = recipient.startsWith('@') || (!isWalletAddress && recipient.length < 20);
      
      if (isUsername) {
        const username = recipient.replace('@', '');
        
        // Self-tip check for username
        if (msg.from.username === username) {
          await this.bot.sendMessage(chatId, '🤔 You cannot tip yourself!', {
            reply_to_message_id: messageId
          });
          return;
        }
        
        await this.processTipToUsername(fromUserId, username, amount, chatId, messageId);
      } else if (isWalletAddress) {
        await this.processTipToAddress(fromUserId, recipient, amount, chatId, messageId);
      } else {
        await this.bot.sendMessage(chatId, '❌ Invalid recipient! Use @username or wallet address', {
          reply_to_message_id: messageId
        });
      }
    });

    // Balance command
    this.bot.onText(/\/balance/, async (msg) => {
      const userId = msg.from?.id!;
      const chatId = msg.chat.id;
      
      const wallet = await this.walletManager.getWalletInfo(userId);
      if (!wallet || !wallet.isConnected) {
        await this.bot.sendMessage(chatId, '❌ Please connect your wallet first: /connect ADDRESS');
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

🔸 \`/tip @username amount\` - Send tip to user
🔸 \`/tip wallet_address amount\` - Send tip to wallet
🔸 \`/connect ADDRESS\` - Connect wallet  
🔸 \`/balance\` - Show balance
🔸 \`/wallet\` - Wallet status

**Usage Examples:**
• \`/tip @john 0.5\` - Send 0.5 TON to @john
• \`/tip EQD4FPq...7Ww_c3f 1.0\` - Send 1.0 TON to wallet
• \`/tip alice 2\` - Send 2 TON to alice (without @)

💡 Bot works in groups and private chats!
      `;
      
      await this.bot.sendMessage(msg.chat.id, helpText, { parse_mode: 'Markdown' });
    });

    // Hata yakalama
    this.bot.on('error', (error) => {
      console.error('Bot Error:', error);
    });
  }

  private async processTipToUsername(
    fromUserId: number, 
    toUsername: string, 
    amount: number, 
    chatId: number, 
    messageId: number
  ) {
    try {
      // Tip confirmation button
      const keyboard = {
        inline_keyboard: [[
          { text: '✅ Confirm', callback_data: `confirm_tip_username_${fromUserId}_${toUsername}_${amount}` },
          { text: '❌ Cancel', callback_data: `cancel_tip_${fromUserId}` }
        ]]
      };

      await this.bot.sendMessage(
        chatId,
        `💸 **Tip Confirmation**\n\n📤 **To:** @${toUsername}\n💰 **Amount:** ${amount} TON\n\n⏰ Please confirm within 30 seconds.`,
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

  private async processTipToAddress(
    fromUserId: number, 
    toAddress: string, 
    amount: number, 
    chatId: number, 
    messageId: number
  ) {
    try {
      // Validate TON address format
      if (!this.walletManager.isValidTonAddress(toAddress)) {
        await this.bot.sendMessage(chatId, '❌ Invalid TON wallet address format!', {
          reply_to_message_id: messageId
        });
        return;
      }

      // Tip confirmation button
      const keyboard = {
        inline_keyboard: [[
          { text: '✅ Confirm', callback_data: `confirm_tip_address_${fromUserId}_${toAddress}_${amount}` },
          { text: '❌ Cancel', callback_data: `cancel_tip_${fromUserId}` }
        ]]
      };

      const shortAddress = `${toAddress.substring(0, 6)}...${toAddress.substring(toAddress.length - 6)}`;

      await this.bot.sendMessage(
        chatId,
        `💸 **Tip Confirmation**\n\n📤 **To:** \`${shortAddress}\`\n💰 **Amount:** ${amount} TON\n\n⏰ Please confirm within 30 seconds.`,
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