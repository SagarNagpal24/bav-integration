import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import Bill from "@/models/bill";
import { applyInventoryDelta, billItemDeltas } from "@/lib/inventory";

export async function PATCH(req, { params }) {
  try {
    await requireAuth();
  } catch (e) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await connectDB();

    const { id, idx } = params;
    const bill = await Bill.findById(id);

    if (!bill) {
      return NextResponse.json({ error: "Bill not found" }, { status: 404 });
    }

    const i = parseInt(idx, 10);
    if (isNaN(i) || i < 0 || i >= bill.items.length) {
      return NextResponse.json({ error: "Invalid item index" }, { status: 400 });
    }

    const removed = bill.items[i];
    bill.items.splice(i, 1);
    bill.total = bill.items.reduce(
      (sum, it) => sum + (it.Saleprice || 0) * (it.qty || 0),
      0
    );

    try {
      await applyInventoryDelta(billItemDeltas([removed], 1));
    } catch (stockErr) {
      console.error("Inventory restore error:", stockErr);
    }

    if (bill.items.length === 0) {
      await bill.deleteOne();
      return NextResponse.json({ ok: true, deleted: true });
    } else {
      await bill.save();
      return NextResponse.json(bill);
    }
  } catch (e) {
    console.error("PATCH /api/bills/[id]/items/[idx] error:", e);
    return NextResponse.json(
      { error: "Failed to delete bill item" },
      { status: 500 }
    );
  }
}
