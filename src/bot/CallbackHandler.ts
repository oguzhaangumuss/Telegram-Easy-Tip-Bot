import TelegramBot from 'node-telegram-bot-api';
import { TipService } from '../services/TipService';
import { WalletManager } from '../ton/WalletManager';
import { TipRequest } from '../types';

export class CallbackHandler {
  private bot: TelegramBot;
  private tipService: TipService;
  private walletManager: WalletManager;
  private activeTips = new Map<string, TipRequest>();

  constructor(bot: TelegramBot, tipService: TipService, walletManager: WalletManager, activeTips: Map<string, TipRequest>) {
    this.bot = bot;
    this.tipService = tipService;
    this.walletManager = walletManager;
    this.activeTips = activeTips;
    this.setupCallbacks();
  }

  private setupCallbacks() {
    // Tip confirmation callback
    this.bot.on('callback_query', async (callbackQuery) => {
      const { data, from, message } = callbackQuery;
      
      if (!data || !message) return;

      // Confirm tip: confirm_shortId
      if (data.startsWith('confirm_')) {
        await this.handleTipConfirmation(callbackQuery);
      }
      
      // Cancel tip: cancel_shortId
      else if (data.startsWith('cancel_')) {
        await this.handleTipCancellation(callbackQuery);
      }

      // Send callback response
      await this.bot.answerCallbackQuery(callbackQuery.id);
    });
  }

  private async handleTipConfirmation(callbackQuery: any) {
    const { data, from, message } = callbackQuery;
    const shortId = data.replace('confirm_', '');

    // Get tip data from activeTips
    const tipRequest = this.activeTips.get(shortId);
    if (!tipRequest) {
      await this.bot.editMessageText(
        '❌ Tip request expired or not found.',
        {
          chat_id: message.chat.id,
          message_id: message.message_id
        }
      );
      return;
    }

    // Only the sender can confirm
    if (from.id !== tipRequest.fromUserId) {
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

      // Check if it's a username tip or direct address tip
      if (tipRequest.toUsername) {
        // Username tip
        const toUserId = await this.findUserByUsername(tipRequest.toUsername, message.chat.id);
        
        if (!toUserId) {
          await this.bot.editMessageText(
            `❌ User @${tipRequest.toUsername} not found or hasn't connected wallet.`,
            {
              chat_id: message.chat.id,
              message_id: message.message_id
            }
          );
          this.activeTips.delete(shortId);
          return;
        }

        // Get user's wallet address from our database
        const userWallet = await this.getUserWallet(toUserId);
        if (!userWallet) {
          await this.bot.editMessageText(
            `❌ @${tipRequest.toUsername} hasn't connected their wallet yet.`,
            {
              chat_id: message.chat.id,
              message_id: message.message_id
            }
          );
          this.activeTips.delete(shortId);
          return;
        }

        recipientAddress = userWallet;
        displayName = `@${tipRequest.toUsername}`;
      } else if (tipRequest.directAddress) {
        // Direct wallet address tip
        recipientAddress = tipRequest.directAddress;
        displayName = `\`${tipRequest.directAddress.substring(0, 6)}...${tipRequest.directAddress.substring(tipRequest.directAddress.length - 6)}\``;
      } else {
        throw new Error('Invalid tip request: no recipient specified');
      }

      // Start tip process - directly send to address
      const transaction = await this.processTipDirect(tipRequest.fromUserId, recipientAddress, tipRequest.amount);

      if (transaction.status === 'completed') {
        await this.bot.editMessageText(
          `✅ **Tip Sent Successfully!**\n\n📤 **To:** ${displayName}\n💰 **Amount:** ${tipRequest.amount} TON\n🔗 **Transaction:** \`${transaction.txHash}\`\n\n🎉 Your tip has been delivered!`,
          {
            chat_id: message.chat.id,
            message_id: message.message_id,
            parse_mode: 'Markdown'
          }
        );

        // If it's a username tip, try to notify the recipient
        if (tipRequest.toUsername) {
          try {
            const toUserId = await this.findUserByUsername(tipRequest.toUsername, message.chat.id);
            if (toUserId) {
              await this.bot.sendMessage(
                toUserId,
                `🎉 **You Received a Tip!**\n\n💰 **Amount:** ${tipRequest.amount} TON\n👤 **From:** @${from.username || 'Unknown'}\n🔗 **TX:** \`${transaction.txHash}\``,
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

      // Clean up tip request
      this.activeTips.delete(shortId);

    } catch (error) {
      console.error('Tip confirmation error:', error);
      await this.bot.editMessageText(
        `❌ **Tip Failed!**\n\nError: ${error}`,
        {
          chat_id: message.chat.id,
          message_id: message.message_id
        }
      );
      this.activeTips.delete(shortId);
    }
  }

  private async handleTipCancellation(callbackQuery: any) {
    const { data, from, message } = callbackQuery;
    const shortId = data.replace('cancel_', '');

    // Get tip data from activeTips
    const tipRequest = this.activeTips.get(shortId);
    if (!tipRequest) {
      await this.bot.editMessageText(
        '❌ Tip request not found.',
        {
          chat_id: message.chat.id,
          message_id: message.message_id
        }
      );
      return;
    }

    // Only the sender can cancel
    if (from.id !== tipRequest.fromUserId) {
      return;
    }

    await this.bot.editMessageText(
      '❌ Tip cancelled.',
      {
        chat_id: message.chat.id,
        message_id: message.message_id
      }
    );

    // Clean up tip request
    this.activeTips.delete(shortId);
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