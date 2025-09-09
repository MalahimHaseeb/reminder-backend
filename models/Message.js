import mongoose from "mongoose";

const MessageSchema = new mongoose.Schema(
  {
    message: { type: String, required: true, trim: true },
    scheduledDate: { type: Date, required: true },
    isSend: { type: Boolean, default: false },
    sendDaily: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.models.Message || mongoose.model("Message", MessageSchema);
