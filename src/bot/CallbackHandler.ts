import TelegramBot from 'node-telegram-bot-api';
import { TipService } from '../services/TipService';
import { TipRequest } from '../types';

export class CallbackHandler {
  private bot: TelegramBot;
  private tipService: TipService;

  constructor(bot: TelegramBot, tipService: TipService) {
    this.bot = bot;
    this.tipService = tipService;
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

    const fromUserId = parseInt(parts[2]);
    const toUsername = parts[3];
    const amount = parseFloat(parts[4]);

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
      // Find recipient user (mock - in reality search group members)
      const toUserId = await this.findUserByUsername(toUsername, message.chat.id);
      
      if (!toUserId) {
        await this.bot.editMessageText(
          `❌ User @${toUsername} not found.`,
          {
            chat_id: message.chat.id,
            message_id: message.message_id
          }
        );
        return;
      }

      // Create tip request
      const tipRequest: TipRequest = {
        fromUserId,
        toUserId,
        toUsername,
        amount,
        chatId: message.chat.id,
        messageId: message.message_id
      };

      // Start tip process
      const transaction = await this.tipService.processTip(tipRequest);

      if (transaction.status === 'completed') {
        await this.bot.editMessageText(
          `✅ **Tip Sent!**\n\n💸 ${amount} TON sent to @${toUsername}\n🔗 TX: \`${transaction.txHash}\``,
          {
            chat_id: message.chat.id,
            message_id: message.message_id,
            parse_mode: 'Markdown'
          }
        );

        // Send private message to recipient
        try {
          await this.bot.sendMessage(
            toUserId,
            `🎉 **You Received a Tip!**\n\n💰 You received ${amount} TON!\n👤 From: @${from.username || 'Unknown'}\n🔗 TX: \`${transaction.txHash}\``,
            { parse_mode: 'Markdown' }
          );
        } catch (error) {
          console.log('Could not send private message to recipient:', error);
        }

      } else {
        await this.bot.editMessageText(
          `❌ **Tip Failed!**\n\n${transaction.status === 'failed' ? 'Transaction failed.' : 'Pending...'}`,
          {
            chat_id: message.chat.id,
            message_id: message.message_id
          }
        );
      }

    } catch (error) {
      console.error('Tip confirmation error:', error);
      await this.bot.editMessageText(
        '❌ Tip could not be sent. Please try again.',
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
}