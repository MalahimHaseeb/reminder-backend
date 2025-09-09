import express from "express";
import mongoose from "mongoose";
import cron from "node-cron";
import nodemailer from "nodemailer";
import { addDays } from "date-fns";
import dotenv from "dotenv";
import Message from "./models/Message.js";

dotenv.config();

const app = express();
app.use(express.json());

// MongoDB connection
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
    .then(() => console.log("✅ MongoDB connected"))
    .catch((err) => console.error("❌ MongoDB error:", err));

// Nodemailer setup
const transporter = nodemailer.createTransport({
    host: "smtp.hostinger.com",
    port: 465,
    secure: true,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

// 🕒 Cron job runs every minute
cron.schedule("* * * * *", async () => {
    const nowUTC = new Date();
    const nowPakistan = new Date(nowUTC.getTime() + (5 * 60 * 60 * 1000)); // UTC+5
    console.log("⏰ Running cron job...", nowPakistan.toLocaleString("en-US", { timeZone: "Asia/Karachi" }));

    try {
        // Round to the nearest minute to avoid missing messages due to second differences
        const currentMinuteUTC = new Date(nowUTC);
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

                    // Your email sending code here
                    console.log(`📩 Email sent: ${msg.message} at ${nowPakistan.toLocaleString("en-US", { timeZone: "Asia/Karachi" })}`);

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
                console.error(`❌ Failed to send email for message ${msg._id}:`, err);
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
    res.send("🚀 Express cron app running");
});

// Start server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));