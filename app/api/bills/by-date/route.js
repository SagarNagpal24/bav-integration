import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import Bill from "@/models/bill";
import { applyInventoryDelta, billItemDeltas } from "@/lib/inventory";

export async function DELETE(req) {
  try {
    await requireAdmin();
  } catch (e) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date");

    if (!date) {
      return NextResponse.json(
        { error: "date is required (YYYY-MM-DD)" },
        { status: 400 }
      );
    }

    const bills = await Bill.find({ date }).lean();
    const out = await Bill.deleteMany({ date });

    try {
      const items = bills.flatMap((b) => b.items || []);
      await applyInventoryDelta(billItemDeltas(items, 1));
    } catch (stockErr) {
      console.error("Inventory restore error:", stockErr);
    }

    return NextResponse.json({ deletedCount: out.deletedCount });
  } catch (e) {
    console.error("DELETE /api/bills/by-date error:", e);
    return NextResponse.json(
      { error: "Failed to delete bills by date" },
      { status: 500 }
    );
  }
}
