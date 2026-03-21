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

const BillSchema = new mongoose.Schema(
  {
    date: { type: String, required: true }, // "YYYY-MM-DD"
    items: { type: [LineItemSchema], default: [] },
    total: { type: Number, required: true },
  },
  { timestamps: true }
);

BillSchema.index({ date: 1 });

export default mongoose.models.Bill || mongoose.model("Bill", BillSchema);