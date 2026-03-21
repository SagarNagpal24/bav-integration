import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import Bill from "@/models/bill";

export async function PATCH(req, { params }) {
  try {
    await connectDB();
    await requireAuth();

    const { id, idx } = params;
    const bill = await Bill.findById(id);

    if (!bill) {
      return NextResponse.json({ error: "Bill not found" }, { status: 404 });
    }

    const i = parseInt(idx, 10);
    if (isNaN(i) || i < 0 || i >= bill.items.length) {
      return NextResponse.json({ error: "Invalid item index" }, { status: 400 });
    }

    bill.items.splice(i, 1);
    bill.total = bill.items.reduce(
      (sum, it) => sum + (it.Saleprice || 0) * (it.qty || 0),
      0
    );

    if (bill.items.length === 0) {
      await bill.deleteOne();
      return NextResponse.json({ ok: true, deleted: true });
    } else {
      await bill.save();
      return NextResponse.json(bill);
    }
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "Failed to delete bill item" },
      { status: 500 }
    );
  }
}