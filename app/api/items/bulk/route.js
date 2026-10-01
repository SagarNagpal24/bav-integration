import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import Item from "@/models/Item";
import { normalizeItem } from "@/lib/helpers";

export async function POST(req) {
  try {
    await requireAuth();
  } catch (e) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await connectDB();

    const body = await req.json();
    const items = body.items || [];

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "No items provided" }, { status: 400 });
    }

    const ops = items
      .map((raw) => {
        const it = normalizeItem(raw);

        if (!it.Code) return null;

        return {
          updateOne: {
            filter: {
              Code: it.Code,
              MMScode: it.MMScode || "",
            },
            update: { $set: it },
            upsert: true,
          },
        };
      })
      .filter(Boolean);

    if (ops.length === 0) {
      return NextResponse.json(
        { error: "No valid items with Code" },
        { status: 400 }
      );
    }

    const result = await Item.bulkWrite(ops);

    return NextResponse.json({
      ok: true,
      count: ops.length,
      result,
    });
  } catch (e) {
    console.error("POST /api/items/bulk error:", e);
    return NextResponse.json(
      { error: "Failed to upsert items" },
      { status: 500 }
    );
  }
}
