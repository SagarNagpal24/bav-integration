import mongoose from "mongoose";

const LineItemSchema = new mongoose.Schema(
  {
    Code: String,
    MMScode: String,
    Title: String,
    Saleprice: Number,
    Type: String,
    qty: Number,
  },
  { _id: false }
);

const VALID_COUNTERS = ["shop", "stall", "admin"];

const BillSchema = new mongoose.Schema(
  {
    date: { type: String, required: true }, // "YYYY-MM-DD"
    counter: { type: String, enum: VALID_COUNTERS, default: "shop", index: true },
    items: { type: [LineItemSchema], default: [] },
    total: { type: Number, required: true },
  },
  { timestamps: true }
);

BillSchema.index({ date: 1 });

export default mongoose.models.Bill || mongoose.model("Bill", BillSchema);