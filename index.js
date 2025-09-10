import express from "express";
import mongoose from "mongoose";
import cron from "node-cron";
import { addDays } from "date-fns";
import dotenv from "dotenv";
import { Client, GatewayIntentBits } from "discord.js";
import Message from "./models/Message.js";

dotenv.config();

const app = express();
app.use(express.json());

// MongoDB connection
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ MongoDB connected"))
    .catch((err) => console.error("❌ MongoDB error:", err));

// Discord bot setup
const discordClient = new Client({ 
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent
    ] 
});

discordClient.once('ready', () => {
    console.log(`✅ Discord bot logged in as ${discordClient.user.tag}`);
});

// Login to Discord
discordClient.login(process.env.DISCORD_BOT_TOKEN).catch(error => {
    console.error("❌ Failed to log in to Discord:", error);
});

// Function to send Discord message
async function sendDiscordMessage(userId, messageContent) {
    try {
        // Check if the client is ready
        if (!discordClient.isReady()) {
            console.log("⚠️ Discord client not ready yet, waiting...");
            return false;
        }
        
        const user = await discordClient.users.fetch(userId);
        await user.send(messageContent);
        console.log(`✅ Discord message sent to ${user.tag}`);
        return true;
    } catch (error) {
        console.error("❌ Failed to send Discord message:", error);
        return false;
    }
}

// 🕒 Cron job runs every minute
cron.schedule("* * * * *", async () => {
    console.log("⏰ Running cron job...");

    try {
        // Round to the nearest minute to avoid missing messages due to second differences
        const currentMinuteUTC = new Date();
        currentMinuteUTC.setSeconds(0, 0);

        // 1️⃣ Find messages that need sending
        const messagesToSend = await Message.find({
            scheduledDate: {
                $lte: currentMinuteUTC,
                $gte: new Date(currentMinuteUTC.getTime() - 60000) // Check within the last minute too
            },
            isSend: false,
        });

        console.log(`📋 Found ${messagesToSend.length} messages to process`);

        for (const msg of messagesToSend) {
            try {
                // Check if the message is exactly at the scheduled minute
                const msgDate = new Date(msg.scheduledDate);
                if (msgDate.getTime() <= currentMinuteUTC.getTime() &&
                    msgDate.getTime() >= currentMinuteUTC.getTime() - 60000) {

                    // Send Discord message
                    await sendDiscordMessage(
                        process.env.DISCORD_USER_ID,
                        `📩 Scheduled Message:\n${msg.message}`
                    );

                    // Mark as sent
                    msg.isSend = true;

                    if (msg.sendDaily) {
                        // extend by 1 day and reset send status
                        msg.scheduledDate = addDays(msg.scheduledDate, 1);
                        msg.isSend = false;
                        console.log(`🔁 Rescheduled daily message for next day`);
                    }

                    await msg.save();
                }
            } catch (err) {
                console.error(`❌ Failed to process message ${msg._id}:`, err);
            }
        }

        // 2️⃣ Delete only expired one-time messages (older than 1 day)
        const oneDayAgo = new Date();
        oneDayAgo.setDate(oneDayAgo.getDate() - 1);

        const deleted = await Message.deleteMany({
            scheduledDate: { $lte: oneDayAgo },
            isSend: true,
            sendDaily: false,
        });

        if (deleted.deletedCount > 0) {
            console.log(`🗑️ Deleted ${deleted.deletedCount} expired one-time messages`);
        }
    } catch (err) {
        console.error("❌ Cron error:", err);
    }
});

// Basic API route
app.get("/", (req, res) => {
    res.send("🚀 Express cron app with Discord bot running");
});

// API route to delete all bot messages from DM
app.delete("/delete-dm-messages", async (req, res) => {
    try {
        const user = await discordClient.users.fetch(process.env.DISCORD_USER_ID);
        const dmChannel = await user.createDM();

        // Fetch recent messages (you can increase the limit up to 100 at a time)
        const messages = await dmChannel.messages.fetch({ limit: 100 });

        // Filter only messages sent by the bot
        const botMessages = messages.filter(msg => msg.author.id === discordClient.user.id);

        // Delete each message
        for (const [id, msg] of botMessages) {
            await msg.delete().catch(err => console.error("⚠️ Delete error:", err));
        }

        res.json({ success: true, deletedCount: botMessages.size });
    } catch (error) {
        console.error("❌ Failed to delete messages:", error);
        res.status(500).json({ success: false, error: "Failed to delete messages" });
    }
});


// Start server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));