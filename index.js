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

// Enhanced MongoDB connection with better error handling
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ MongoDB connected"))
    .catch((err) => {
        console.error("❌ MongoDB connection error:", err);
        process.exit(1); // Exit process on DB connection failure
    });

// Nodemailer setup with debug logging
const transporter = nodemailer.createTransporter({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
    debug: true, // Enable debug output
    logger: true // Enable logger
});

// Verify transporter configuration
transporter.verify(function(error, success) {
    if (error) {
        console.error('❌ Transporter verification failed:', error);
    } else {
        console.log('✅ Transporter is ready to send emails');
    }
});

// Enhanced cron job with better error handling
cron.schedule("* * * * *", async () => {
    console.log("⏰ Running cron job...");
    
    try {
        const nowUTC = new Date();
        const nowPakistan = new Date(nowUTC.getTime() + (5 * 60 * 60 * 1000));
        console.log("Current time (UTC):", nowUTC.toISOString());
        console.log("Current time (Pakistan):", nowPakistan.toLocaleString("en-US", { timeZone: "Asia/Karachi" }));

        // Round to the nearest minute
        const currentMinuteUTC = new Date(nowUTC);
        currentMinuteUTC.setSeconds(0, 0);
        
        const oneMinuteAgoUTC = new Date(currentMinuteUTC.getTime() - 60000);

        // 1️⃣ Find messages that need sending
        const messagesToSend = await Message.find({
            scheduledDate: {
                $gte: oneMinuteAgoUTC,
                $lte: currentMinuteUTC
            },
            isSend: false,
        });

        console.log(`📋 Found ${messagesToSend.length} messages to process`);

        for (const msg of messagesToSend) {
            try {
                console.log(`Processing message: ${msg._id}, scheduled for: ${msg.scheduledDate}`);
                
                // Send email
                const mailOptions = {
                    from: `"Message Scheduler" <${process.env.EMAIL_USER}>`,
                    to: "haseeb516m@gmail.com",
                    subject: "Scheduled Message",
                    html: `... your email template ...`
                };

                const info = await transporter.sendMail(mailOptions);
                console.log("📩 Email sent successfully:", info.messageId);

                // Mark as sent
                msg.isSend = true;

                if (msg.sendDaily) {
                    // extend by 1 day and reset send status
                    msg.scheduledDate = addDays(msg.scheduledDate, 1);
                    msg.isSend = false;
                    console.log(`🔁 Rescheduled daily message for next day: ${msg.scheduledDate}`);
                }

                await msg.save();
                
            } catch (err) {
                console.error(`❌ Failed to process message ${msg._id}:`, err);
                // Don't break the loop, continue with other messages
            }
        }

        // 2️⃣ Delete expired one-time messages
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
        console.error("❌ Cron job error:", err);
    }
});

// Health check endpoint
app.get("/health", (req, res) => {
    res.json({ 
        status: "OK", 
        time: new Date().toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    });
});

// Basic API route
app.get("/", (req, res) => {
    res.send("🚀 Express cron app running");
});

// Start server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));