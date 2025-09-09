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
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ MongoDB connected"))
    .catch((err) => console.error("❌ MongoDB error:", err));

// Nodemailer setup
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,   // your Gmail address
        pass: process.env.EMAIL_PASS,   // your Gmail App Password
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

                    try {
                        const info = await transporter.sendMail({
                            from: `"Message Scheduler" <${process.env.EMAIL_USER}>`,
                            to: "haseeb516m@gmail.com",
                            subject: "Scheduled Message",
                            html: `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <style>
        body {
          font-family: Arial, sans-serif;
          margin: 0;
          padding: 0;
          background-color: #f4f4f7;
        }
        .container {
          max-width: 600px;
          margin: 20px auto;
          background-color: #ffffff;
          border-radius: 10px;
          box-shadow: 0 0 10px rgba(0,0,0,0.1);
          overflow: hidden;
        }
        .header {
          background-color: #4f46e5;
          color: #ffffff;
          text-align: center;
          padding: 20px;
          font-size: 24px;
          font-weight: bold;
        }
        .content {
          padding: 20px;
          font-size: 16px;
          color: #333333;
          line-height: 1.5;
        }
        .footer {
          padding: 10px 20px;
          text-align: center;
          font-size: 12px;
          color: #999999;
          border-top: 1px solid #eeeeee;
        }
        @media only screen and (max-width: 600px) {
          .container {
            width: 95%;
          }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">📩 Scheduled Message</div>
        <div class="content">
          <p>Hello,</p>
          <p>Here is your scheduled message:</p>
          <blockquote style="background:#f9f9f9;padding:10px;border-left:5px solid #4f46e5;">
            ${msg.message}
          </blockquote>
          <p>Sent at: ${nowPakistan}</p>
        </div>
        <div class="footer">Message Scheduler • Your automated reminder system</div>
      </div>
    </body>
    </html>
    `
                        });

                        console.log("📩 Email actually sent:", info.messageId);
                    } catch (error) {
                        console.error("❌ Failed to send email:", error);
                    }

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