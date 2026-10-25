import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import Item from "@/models/Item";
import { normalizeType } from "@/lib/helpers";

export async function POST(req) {
  try {
    await requireAdmin();
  } catch (e) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await connectDB();

    const body = await req.json().catch(() => ({}));
    const rows = Array.isArray(body?.rows) ? body.rows : [];

    if (rows.length === 0) {
      return NextResponse.json({ error: "No stock rows provided" }, { status: 400 });
    }

    // Aggregate quantities per MMScode (Item No) so repeats in one file merge.
    const agg = new Map();

    for (const r of rows) {
      const MMScode = String(r?.MMScode ?? "").trim();
      const qty = Math.floor(Number(r?.qty) || 0);
      if (!MMScode || qty <= 0) continue;

      if (!agg.has(MMScode)) {
        agg.set(MMScode, {
          MMScode,
          qty: 0,
          Code: String(r?.Code ?? "").trim(),
          Title: String(r?.Title ?? "").trim(),
          Type: normalizeType(r?.Type),
        });
      }

      const entry = agg.get(MMScode);
      entry.qty += qty;
      if (!entry.Code) entry.Code = String(r?.Code ?? "").trim();
      if (!entry.Title) entry.Title = String(r?.Title ?? "").trim();
      if (!entry.Type) entry.Type = normalizeType(r?.Type);
    }

    const entries = [...agg.values()];
    if (entries.length === 0) {
      return NextResponse.json(
        { error: "No valid rows with Item No and Quantity" },
        { status: 400 }
      );
    }

    const mmsCodes = entries.map((e) => e.MMScode);
    const existing = await Item.find({ MMScode: { $in: mmsCodes } })
      .select("_id MMScode")
      .lean();

    const existingByMms = new Map();
    for (const doc of existing) {
      if (!existingByMms.has(doc.MMScode)) existingByMms.set(doc.MMScode, doc._id);
    }

    const updates = [];
    const newDocs = [];
    const needsPrice = [];

    for (const e of entries) {
      if (existingByMms.has(e.MMScode)) {
        updates.push({
          updateOne: {
            filter: { _id: existingByMms.get(e.MMScode) },
            update: { $inc: { Inventory: e.qty } },
          },
        });
      } else {
        newDocs.push({
          Code: e.Code || e.MMScode,
          MMScode: e.MMScode,
          Title: e.Title || "",
          Type: e.Type || "",
          Saleprice: null,
          Inventory: e.qty,
        });
        needsPrice.push(e.Code || e.MMScode);
      }
    }

    const insertOps = newDocs.map((doc) => ({
      insertOne: { document: doc },
    }));

    if (updates.length || insertOps.length) {
      await Item.bulkWrite([...updates, ...insertOps], { ordered: false });
    }

    return NextResponse.json({
      ok: true,
      updated: updates.length,
      created: newDocs.length,
      needsPrice,
    });
  } catch (e) {
    console.error("POST /api/items/stock error:", e);
    return NextResponse.json({ error: "Failed to update stock" }, { status: 500 });
  }
}
