import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import Bill from "@/models/bill";

export async function DELETE(req) {
  try {
    await requireAuth();
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

    const out = await Bill.deleteMany({ date });
    return NextResponse.json({ deletedCount: out.deletedCount });
  } catch (e) {
    console.error("DELETE /api/bills/by-date error:", e);
    return NextResponse.json(
      { error: "Failed to delete bills by date" },
      { status: 500 }
    );
  }
}
