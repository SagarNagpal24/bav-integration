import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { normalizeBillPayload } from "@/lib/helpers";
import Bill from "@/models/Bill";

export async function POST(req) {
  try {
    await connectDB();
    await requireAuth();

    const body = await req.json();

    const rawBills = Array.isArray(body)
      ? body
      : Array.isArray(body?.bills)
      ? body.bills
      : [];

    if (rawBills.length === 0) {
      return NextResponse.json(
        { error: "No valid bill data found" },
        { status: 400 }
      );
    }

    const docsToInsert = rawBills
      .map((raw) => normalizeBillPayload(raw))
      .filter(
        (bill) =>
          bill.date &&
          Array.isArray(bill.items) &&
          bill.items.length > 0 &&
          typeof bill.total === "number"
      );

    if (docsToInsert.length === 0) {
      return NextResponse.json(
        { error: "No valid normalized bills to restore" },
        { status: 400 }
      );
    }

    const inserted = await Bill.insertMany(docsToInsert, { ordered: false });

    return NextResponse.json({
      ok: true,
      restored: inserted.length,
      received: rawBills.length,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "Failed to restore bills backup" },
      { status: 500 }
    );
  }
}