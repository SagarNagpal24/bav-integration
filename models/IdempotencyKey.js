import mongoose from "mongoose";

const IdempotencyKeySchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    billId: { type: mongoose.Schema.Types.ObjectId, ref: "Bill" },
  },
  { timestamps: true }
);

export default mongoose.models.IdempotencyKey ||
  mongoose.model("IdempotencyKey", IdempotencyKeySchema);