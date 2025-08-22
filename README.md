# TON Tip Bot

<div align="center">
  <img src="public/easy-tip.png" alt="Easy Tip Bot Logo" width="200"/>
  
  <p>A Telegram bot for easy TON cryptocurrency tipping in groups.</p>
  
  [![Demo Video](https://img.youtube.com/vi/BVutGKezCAU/0.jpg)](https://youtu.be/BVutGKezCAU)
  
  <p><strong>👆 Click to watch demo video</strong></p>
</div>

## Features

- 💸 **Easy Tipping**: Send TON tips with simple commands
- 🔗 **TON Connect**: Secure wallet integration
- 🏦 **Balance Tracking**: View wallet balance and transaction history
- 👥 **Group Support**: Works seamlessly in Telegram groups
- ⚡ **Fast Transactions**: Quick tip confirmations

## Commands

- `/start` - Start the bot
- `/connect` - Connect your TON wallet
- `/tip @username amount` - Send tip to user
- `/balance` - View your wallet balance
- `/help` - Show help message

## Usage Examples

```
/tip @alice 1.5     # Send 1.5 TON to Alice
/tip @bob 0.1       # Send 0.1 TON to Bob
/balance            # Check your balance
```

## Setup

1. Clone the repository:
```bash
git clone https://github.com/oguzhaangumuss/Telegram-Easy-Tip-Bot.git
cd Telegram-Easy-Tip-Bot
```

2. Install dependencies:
```bash
npm install
```

3. Create environment file:
```bash
cp .env.example .env
```

4. Configure your bot token in `.env`:
```
TELEGRAM_BOT_TOKEN=your_bot_token_here
TON_TESTNET=true
ADMIN_CHAT_ID=your_admin_chat_id
```

5. Build and start:
```bash
npm run build
npm start
```

## Development

Start in development mode:
```bash
npm run dev
```

## Tech Stack

- **Node.js** + **TypeScript**
- **Telegram Bot API**
- **TON Connect SDK**
- **TON Blockchain**

## License

MIT