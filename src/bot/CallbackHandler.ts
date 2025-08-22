import TelegramBot from 'node-telegram-bot-api';
import { TipService } from '../services/TipService';
import { WalletManager } from '../ton/WalletManager';
import { TipRequest } from '../types';

export class CallbackHandler {
  private bot: TelegramBot;
  private tipService: TipService;
  private walletManager: WalletManager;

  constructor(bot: TelegramBot, tipService: TipService, walletManager: WalletManager) {
    this.bot = bot;
    this.tipService = tipService;
    this.walletManager = walletManager;
    this.setupCallbacks();
  }

  private setupCallbacks() {
    // Tip confirmation callback
    this.bot.on('callback_query', async (callbackQuery) => {
      const { data, from, message } = callbackQuery;
      
      if (!data || !message) return;

      // Confirm tip: confirm_tip_fromUserId_toUsername_amount
      if (data.startsWith('confirm_tip_')) {
        await this.handleTipConfirmation(callbackQuery);
      }
      
      // Cancel tip: cancel_tip_fromUserId
      else if (data.startsWith('cancel_tip_')) {
        await this.handleTipCancellation(callbackQuery);
      }

      // Send callback response
      await this.bot.answerCallbackQuery(callbackQuery.id);
    });
  }

  private async handleTipConfirmation(callbackQuery: any) {
    const { data, from, message } = callbackQuery;
    const parts = data.split('_');
    
    if (parts.length < 5) return;

    const tipType = parts[2]; // 'username' or 'address'
    const fromUserId = parseInt(parts[3]);
    const recipient = parts[4];
    const amount = parseFloat(parts[5]);

    // Only the sender can confirm
    if (from.id !== fromUserId) {
      await this.bot.editMessageText(
        '❌ Only the sender can confirm this tip.',
        {
          chat_id: message.chat.id,
          message_id: message.message_id
        }
      );
      return;
    }

    try {
      let recipientAddress: string;
      let displayName: string;

      if (tipType === 'username') {
        // Find user by username and get their wallet address
        const toUserId = await this.findUserByUsername(recipient, message.chat.id);
        
        if (!toUserId) {
          await this.bot.editMessageText(
            `❌ User @${recipient} not found or hasn't connected wallet.`,
            {
              chat_id: message.chat.id,
              message_id: message.message_id
            }
          );
          return;
        }

        // Get user's wallet address from our database
        const userWallet = await this.getUserWallet(toUserId);
        if (!userWallet) {
          await this.bot.editMessageText(
            `❌ @${recipient} hasn't connected their wallet yet.`,
            {
              chat_id: message.chat.id,
              message_id: message.message_id
            }
          );
          return;
        }

        recipientAddress = userWallet;
        displayName = `@${recipient}`;
      } else {
        // Direct wallet address
        recipientAddress = recipient;
        displayName = `\`${recipient.substring(0, 6)}...${recipient.substring(recipient.length - 6)}\``;
      }

      // Create tip request
      const tipRequest: TipRequest = {
        fromUserId,
        toUserId: tipType === 'username' ? await this.findUserByUsername(recipient, message.chat.id) || 0 : 0,
        toUsername: tipType === 'username' ? recipient : undefined,
        amount,
        chatId: message.chat.id,
        messageId: message.message_id
      };

      // Start tip process - directly send to address
      const transaction = await this.processTipDirect(fromUserId, recipientAddress, amount);

      if (transaction.status === 'completed') {
        await this.bot.editMessageText(
          `✅ **Tip Sent Successfully!**\n\n📤 **To:** ${displayName}\n💰 **Amount:** ${amount} TON\n🔗 **Transaction:** \`${transaction.txHash}\`\n\n🎉 Your tip has been delivered!`,
          {
            chat_id: message.chat.id,
            message_id: message.message_id,
            parse_mode: 'Markdown'
          }
        );

        // If it's a username tip, try to notify the recipient
        if (tipType === 'username') {
          try {
            const toUserId = await this.findUserByUsername(recipient, message.chat.id);
            if (toUserId) {
              await this.bot.sendMessage(
                toUserId,
                `🎉 **You Received a Tip!**\n\n💰 **Amount:** ${amount} TON\n👤 **From:** @${from.username || 'Unknown'}\n🔗 **TX:** \`${transaction.txHash}\``,
                { parse_mode: 'Markdown' }
              );
            }
          } catch (error) {
            console.log('Could not send private message to recipient:', error);
          }
        }

      } else {
        await this.bot.editMessageText(
          `❌ **Tip Failed!**\n\n${transaction.status === 'failed' ? 'Transaction failed.' : 'Processing...'}`,
          {
            chat_id: message.chat.id,
            message_id: message.message_id
          }
        );
      }

    } catch (error) {
      console.error('Tip confirmation error:', error);
      await this.bot.editMessageText(
        `❌ **Tip Failed!**\n\nError: ${error}`,
        {
          chat_id: message.chat.id,
          message_id: message.message_id
        }
      );
    }
  }

  private async handleTipCancellation(callbackQuery: any) {
    const { data, from, message } = callbackQuery;
    const fromUserId = parseInt(data.split('_')[2]);

    // Only the sender can cancel
    if (from.id !== fromUserId) {
      return;
    }

    await this.bot.editMessageText(
      '❌ Tip cancelled.',
      {
        chat_id: message.chat.id,
        message_id: message.message_id
      }
    );
  }

  private async findUserByUsername(username: string, chatId: number): Promise<number | null> {
    try {
      // Mock implementation - in reality search group members
      // For this example we return random IDs
      const mockUserIds: { [key: string]: number } = {
        'alice': 111111,
        'bob': 222222,
        'charlie': 333333
      };

      return mockUserIds[username.toLowerCase()] || Math.floor(Math.random() * 1000000);
    } catch (error) {
      console.error('User search error:', error);
      return null;
    }
  }

  private async getUserWallet(userId: number): Promise<string | null> {
    try {
      const userWallet = await this.walletManager.getWalletInfo(userId);
      return userWallet?.walletAddress || null;
    } catch (error) {
      console.error('Get user wallet error:', error);
      return null;
    }
  }

  private async processTipDirect(fromUserId: number, toAddress: string, amount: number): Promise<any> {
    try {
      const comment = `Tip from user ${fromUserId}: ${amount} TON`;
      const txHash = await this.walletManager.sendTon(fromUserId, toAddress, amount, comment);
      
      return {
        status: 'completed',
        txHash: txHash
      };
    } catch (error) {
      console.error('Direct tip processing error:', error);
      return {
        status: 'failed',
        error: error
      };
    }
  }
}