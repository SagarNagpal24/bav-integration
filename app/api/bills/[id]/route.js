import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import Bill from "@/models/Bill";

export async function DELETE(req, { params }) {
  try {
    await connectDB();
    await requireAuth();

    const { id } = params;
    const out = await Bill.findByIdAndDelete(id);

    if (!out) {
      return NextResponse.json({ error: "Bill not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to delete bill" }, { status: 500 });
  }
}