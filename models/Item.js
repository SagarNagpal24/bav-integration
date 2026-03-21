import mongoose from "mongoose";

const ItemSchema = new mongoose.Schema(
  {
    Code: { type: String, required: true, index: true },
    MMScode: { type: String },
    Title: { type: String, required: true },
    Saleprice: { type: Number, required: true },
    Type: { type: String },
  },
  { timestamps: true }
);

export default mongoose.models.Item || mongoose.model("Item", ItemSchema);