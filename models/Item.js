import mongoose from "mongoose";

const SCHEMA_VERSION = 2;

const ItemSchema = new mongoose.Schema(
  {
    Code: { type: String, required: true, index: true },
    MMScode: { type: String },
    Title: { type: String, required: true },
    Saleprice: { type: Number, default: null },
    Type: { type: String },
    Inventory: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

// Drop the cached model when the schema changes so Next.js hot-reload
// doesn't keep using a stale Item model.
if (
  mongoose.models.Item &&
  global.__bavItemSchemaVersion !== SCHEMA_VERSION
) {
  delete mongoose.models.Item;
}

global.__bavItemSchemaVersion = SCHEMA_VERSION;

export default mongoose.models.Item || mongoose.model("Item", ItemSchema);