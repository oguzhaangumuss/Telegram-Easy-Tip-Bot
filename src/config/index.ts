import dotenv from 'dotenv';
import { BotConfig } from '../types';

dotenv.config();

export const config: BotConfig = {
  token: process.env.TELEGRAM_BOT_TOKEN || '',
  isTestnet: process.env.TON_TESTNET === 'true',
  adminChatId: process.env.ADMIN_CHAT_ID ? parseInt(process.env.ADMIN_CHAT_ID) : undefined
};

if (!config.token) {
  throw new Error('TELEGRAM_BOT_TOKEN is required');
}