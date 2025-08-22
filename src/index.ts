import { TipBot } from './bot/TipBot';
import { config } from './config';

async function main() {
  try {
    console.log('🚀 Starting TON Tip Bot...');
    
    const bot = new TipBot();
    await bot.start();
    
    console.log('✅ Bot is running!');
  } catch (error) {
    console.error('❌ Failed to start bot:', error);
    process.exit(1);
  }
}

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n🛑 Bot stopped');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Bot terminated');
  process.exit(0);
});

if (require.main === module) {
  main();
}