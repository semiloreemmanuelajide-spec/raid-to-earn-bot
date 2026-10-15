require('dotenv').config();
const express = require('express');
const app = express();
const TelegramBot = require('node-telegram-bot-api');
const { TwitterApi } = require('twitter-api-v2');
const cron = require('node-cron');
const { User, Raid, RaidParticipant, AllowedGroup, sequelize } = require('./models');

const token = process.env.TELEGRAM_BOT_TOKEN;
const botOwnerId = process.env.BOT_OWNER_ID;
const bot = new TelegramBot(token, { polling: true });

const twitterClient = new TwitterApi(process.env.TWITTER_BEARER_TOKEN);
const readOnlyTwitter = twitterClient.readOnly;

const registrationState = {};


// Health-check endpoint for Render & UptimeRobot
app.get('/', (req, res) => {
  res.status(200).send('Netwise Raid Bot is active 24/7!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`HTTP Keep-Alive server listening on port ${PORT}`);
});

sequelize.authenticate()
  .then(async () => {
    console.log('Database connected successfully.');
    await sequelize.sync({ alter: true });
    console.log('Database synced & license system active.');
    console.log('Raid-to-Earn Bot is starting...');
  })
  .catch((err) => console.error('Unable to connect to the database:', err));

// Helper: Check if group is whitelisted & active
async function isGroupLicensed(chatId) {
  const group = await AllowedGroup.findOne({ where: { groupId: chatId.toString(), isActive: true } });
  if (!group) return false;
  
  if (new Date() > group.expiresAt) {
    group.isActive = false;
    await group.save();
    return false;
  }
  return true;
}

// Helper: Check if user is an Admin in the group
async function isGroupAdmin(chatId, userId) {
  try {
    const member = await bot.getChatMember(chatId, userId);
    return ['creator', 'administrator'].includes(member.status);
  } catch (err) {
    return false;
  }
}

// ==========================================
// 1. DEVELOPER SAAS MANAGEMENT COMMAND
// ==========================================

// Command for YOU to authorize a group after receiving payment
// Usage: /addgroup <group_id> <days> (e.g., /addgroup -100123456789 30)
bot.onText(/\/addgroup\s+(\S+)\s+(\d+)/, async (msg, match) => {
  const userId = msg.from.id.toString();

  if (userId !== botOwnerId) {
    return bot.sendMessage(msg.chat.id, ' Unauthorized. Only the bot owner can license groups.');
  }

  const targetGroupId = match[1];
  const days = parseInt(match[2]);
  const expirationDate = new Date();
  expirationDate.setDate(expirationDate.getDate() + days);

  try {
    const [group, created] = await AllowedGroup.findOrCreate({
      where: { groupId: targetGroupId },
      defaults: { expiresAt: expirationDate, isActive: true }
    });

    if (!created) {
      group.expiresAt = expirationDate;
      group.isActive = true;
      await group.save();
    }

    bot.sendMessage(msg.chat.id, `✅ Group \`${targetGroupId}\` licensed successfully for ${days} days until${expirationDate.toISOString().split('T')[0]}.`, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Group licensing error:', error);
    bot.sendMessage(msg.chat.id, '❌ Failed to license group.');
  }
});

// Helper command to quickly get the Group ID when added to a chat
bot.onText(/\/groupid/, (msg) => {
  bot.sendMessage(msg.chat.id, `This Group's ID is: \`${msg.chat.id}\``, { parse_mode: 'Markdown' });
});

// ==========================================
// 2. USER REGISTRATION & PROTECTED RAID COMMAND
// ==========================================

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    `Welcome to the Raid-to-Earn Bot!\n\nUse /register in DM to connect your Twitter handle and Solana wallet.\nLicensed Group Admins can use /raid <tweet_url> <duration_in_minutes> to launch a raid!`
  );
});

bot.onText(/\/register/, async (msg) => {
  const chatId = msg.chat.id;
  const telegramId = msg.from.id.toString();

  try {
    const existingUser = await User.findOne({ where: { telegramId } });
    if (existingUser) {
      return bot.sendMessage(
        chatId,
        `You are already registered!\nTwitter: @${existingUser.twitterUsername}\nSolana Wallet:${existingUser.solanaWallet}`
      );
    }
    registrationState[telegramId] = { step: 'AWAITING_TWITTER' };
    bot.sendMessage(chatId, 'Please enter your Twitter username (without the @):');
  } catch (error) {
    bot.sendMessage(chatId, 'Error connecting to database. Please try again.');
  }
});

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const telegramId = msg.from.id.toString();
  const text = msg.text ? msg.text.trim() : '';

  if (text.startsWith('/')) return;

  const state = registrationState[telegramId];
  if (!state) return;

  if (state.step === 'AWAITING_TWITTER') {
    state.twitterUsername = text.replace('@', '');
    state.step = 'AWAITING_WALLET';
    return bot.sendMessage(chatId, 'Great! Now enter your Solana wallet address:');
  }

  if (state.step === 'AWAITING_WALLET') {
    state.solanaWallet = text;
    try {
      await User.create({
        telegramId,
        twitterUsername: state.twitterUsername,
        solanaWallet: state.solanaWallet,
      });
      delete registrationState[telegramId];
      bot.sendMessage(chatId, `Registration complete!\n\nTwitter: @${state.twitterUsername}\nSolana Wallet:${state.solanaWallet}`);
    } catch (error) {
      bot.sendMessage(chatId, 'Error saving your registration. Please try /register again.');
    }
  }
});

// PROTECTED /raid COMMAND
bot.onText(/\/raid\s+(\S+)(?:\s+(\d+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const tweetUrl = match[1];
  const durationMinutes = parseInt(match[2]) || 60;

  // 1. Verify Group License
  const licensed = await isGroupLicensed(chatId);
  if (!licensed) {
    return bot.sendMessage(
      chatId,
      `🔒 **Group Not Licensed!**\n\nThis group does not have an active subscription. Contact @YourUsername to purchase a license.`,
      { parse_mode: 'Markdown' }
    );
  }

  // 2. Verify User is Admin
  const admin = await isGroupAdmin(chatId, userId);
  if (!admin && userId.toString() !== botOwnerId) {
    return bot.sendMessage(chatId, '⚠️ Only Group Admins can launch raids!');
  }

  const tweetIdMatch = tweetUrl.match(/status\/(\d+)/);
  if (!tweetIdMatch) {
    return bot.sendMessage(chatId, 'Invalid Tweet URL! Format: /raid <tweet_url> <duration_minutes>');
  }

  try {
    const raid = await Raid.create({
      tweetId: tweetIdMatch[1],
      tweetUrl,
      groupId: chatId.toString(),
      durationMinutes,
      status: 'ACTIVE',
    });

    bot.sendMessage(
      chatId,
      `🔥 **NEW RAID LAUNCHED!** 🔥\n\n📌 **Target Tweet:** ${tweetUrl}\n⏳ **Time Limit:** ${durationMinutes} minutes\n\nLike & Retweet the post, then click below when done!`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[{ text: '⚡ I Completed the Raid', callback_data: `verify_raid_${raid.id}` }]],
        },
      }
    );
  } catch (error) {
    bot.sendMessage(chatId, 'Failed to launch raid. Please try again.');
  }
});

bot.on('callback_query', async (query) => {
  if (query.data.startsWith('verify_raid_')) {
    const raidId = query.data.replace('verify_raid_', '');
    const user = await User.findOne({ where: { telegramId: query.from.id.toString() } });

    if (!user) return bot.answerCallbackQuery(query.id, { text: 'You must register first! DM @NetwiseBot to /register.', show_alert: true });

    const raid = await Raid.findByPk(raidId);
    if (!raid || raid.status !== 'ACTIVE') return bot.answerCallbackQuery(query.id, { text: 'This raid has ended!', show_alert: true });

    try {
      const [participant, created] = await RaidParticipant.findOrCreate({
        where: { raidId: raid.id, userId: user.id },
        defaults: { isVerified: false },
      });

      if (!created) return bot.answerCallbackQuery(query.id, { text: 'You have already submitted for this raid!', show_alert: true });
      bot.answerCallbackQuery(query.id, { text: 'Submission recorded! Twitter engagement will be verified when the raid ends.', show_alert: true });
    } catch (err) {
      bot.answerCallbackQuery(query.id, { text: 'Database error. Try again.', show_alert: true });
    }
  }
});

// ==========================================
// 3. BACKGROUND VERIFICATION CRON JOB
// ==========================================

cron.schedule('* * * * *', async () => {
  try {
    const activeRaids = await Raid.findAll({ where: { status: 'ACTIVE' } });
    const now = new Date();

    for (const raid of activeRaids) {
      const expirationTime = new Date(raid.createdAt.getTime() + raid.durationMinutes * 60000);

      if (now >= expirationTime) {
        raid.status = 'COMPLETED';
        await raid.save();

        const participants = await RaidParticipant.findAll({
          where: { raidId: raid.id },
          include: [User]
        });

        if (participants.length === 0) {
          bot.sendMessage(raid.groupId, `🕒 Raid ended for ${raid.tweetUrl}. No users participated.`);
          continue;
        }

        let actualLikingUsernames = [];
        try {
          const likedUsers = await readOnlyTwitter.v2.tweetLikedBy(raid.tweetId, { asPaginator: true });
          for await (const user of likedUsers) {
            actualLikingUsernames.push(user.username.toLowerCase());
          }
        } catch (twitErr) {
          console.error("Twitter API Error:", twitErr.message);
        }

        const winningWallets = [];
        for (const p of participants) {
          const expectedUsername = p.User.twitterUsername.toLowerCase();
          if (actualLikingUsernames.includes(expectedUsername)) {
            p.isVerified = true;
            await p.save();
            winningWallets.push(p.User.solanaWallet);
          }
        }

        if (winningWallets.length > 0) {
          const walletList = winningWallets.join('\n');
          bot.sendMessage(
            raid.groupId,
            `🏆 **RAID VERIFIED & COMPLETED** 🏆\n\nOut of ${participants.length} claims,${winningWallets.length} were verified via Twitter.\n\n**Verified Wallets for Payout:**\n\`${walletList}\``,
            { parse_mode: 'Markdown' }
          );
        } else {
          bot.sendMessage(raid.groupId, `🕒 **RAID COMPLETED**\n\n0 out of ${participants.length} claims were verified on Twitter.`);
        }
      }
    }
  } catch (error) {
    console.error('Cron Job Error:', error);
  }
});

// ==========================================
// PREVENT BOT CRASHES FROM UNHANDLED ERRORS
// ==========================================

process.on('uncaughtException', (err) => {
  console.error('⚠️ Uncaught Exception caught:', err.message);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('⚠️ Unhandled Rejection caught:', reason);
});

// Catch Telegram polling errors without shutting down
bot.on('polling_error', (error) => {
  console.error('⚠️ Telegram Polling Error:', error.code || error.message);
});