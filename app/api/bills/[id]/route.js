import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import Bill from "@/models/bill";

export async function DELETE(req, { params }) {
  try {
    await requireAuth();
  } catch (e) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await connectDB();

    const { id } = params;
    const out = await Bill.findByIdAndDelete(id);

    if (!out) {
      return NextResponse.json({ error: "Bill not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/bills/[id] error:", e);
    return NextResponse.json({ error: "Failed to delete bill" }, { status: 500 });
  }
}
