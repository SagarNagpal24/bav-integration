import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { normalizeBillPayload } from "@/lib/helpers";
import Bill from "@/models/bill";
import IdempotencyKey from "@/models/IdempotencyKey";
import { applyInventoryDelta, billItemDeltas } from "@/lib/inventory";

export async function POST(req) {
  let user;
  try {
    user = await requireAuth();
  } catch (e) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await connectDB();

    const idemKey = String(req.headers.get("Idempotency-Key") || "").trim();

    if (idemKey) {
      const existingKey = await IdempotencyKey.findOne({ key: idemKey }).lean();
      if (existingKey?.billId) {
        const existingBill = await Bill.findById(existingKey.billId).lean();
        if (existingBill) {
          return NextResponse.json(existingBill, { status: 200 });
        }
      }
    }

    const body = await req.json();
    const payload = normalizeBillPayload(body || {});

    // Shop/Stall users are pinned to their own counter. Admins may bill on
    // behalf of either counter (Shop POS / Stall POS) by sending `counter`.
    const role = user?.role;
    if (role === "shop" || role === "stall") {
      payload.counter = role;
    } else {
      const requested = String(payload.counter || "").toLowerCase();
      payload.counter = ["shop", "stall"].includes(requested)
        ? requested
        : role || "shop";
    }

    const { date, items, total } = payload;

    if (!date || !Array.isArray(items) || items.length === 0 || typeof total !== "number") {
      return NextResponse.json(
        {
          error: "Invalid bill payload",
          details: "date, items[], and total are required",
        },
        { status: 400 }
      );
    }

    const bill = await Bill.create(payload);

    try {
      await applyInventoryDelta(billItemDeltas(bill.items, -1));
    } catch (stockErr) {
      console.error("Inventory decrement error:", stockErr);
    }

    if (idemKey) {
      try {
        await IdempotencyKey.create({ key: idemKey, billId: bill._id });
      } catch (e) {
        if (e?.code === 11000) {
          const winner = await IdempotencyKey.findOne({ key: idemKey }).lean();
          if (winner?.billId) {
            const existing = await Bill.findById(winner.billId).lean();
            return NextResponse.json(existing || bill, { status: 200 });
          }
        }
        console.error("Idempotency record error:", e);
      }
    }

    return NextResponse.json(bill, { status: 201 });
  } catch (e) {
    console.error("POST /api/bills error:", e);
    return NextResponse.json({ error: "Failed to create bill" }, { status: 500 });
  }
}

export async function GET(req) {
  let user;
  try {
    user = await requireAuth();
  } catch (e) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const start = searchParams.get("start");
    const end = searchParams.get("end");

    let filter = {};

    if (user?.role === "shop") {
      filter.counter = "shop";
    } else if (user?.role === "stall") {
      filter.counter = "stall";
    } else {
      const counter = searchParams.get("counter");
      if (counter === "shop" || counter === "stall") {
        filter.counter = counter;
      }
    }

    if (date) {
      filter.date = date;
    } else {
      const rangeStart = from || start;
      const rangeEnd = to || end;
      if (rangeStart && rangeEnd) {
        filter.date = { $gte: rangeStart, $lte: rangeEnd };
      }
    }

    const docs = await Bill.find(filter).sort({ createdAt: -1 }).lean();
    return NextResponse.json(docs);
  } catch (e) {
    console.error("GET /api/bills error:", e);
    return NextResponse.json({ error: "Failed to fetch bills" }, { status: 500 });
  }
}
