import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import Item from "@/models/Item";
import { normalizeItem } from "@/lib/helpers";

export async function GET(req) {
  try {
    await connectDB();
    await requireAuth();

    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();

    const filter = q
      ? {
          $or: [
            { Code: new RegExp(q, "i") },
            { MMScode: new RegExp(q, "i") },
            { Title: new RegExp(q, "i") },
            { Type: new RegExp(q, "i") },
          ],
        }
      : {};

    const items = await Item.find(filter).lean();
    return NextResponse.json(items);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to fetch items" }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    await connectDB();
    await requireAuth();

    const body = await req.json();
    const it = normalizeItem(body || {});

    if (!it.Code) {
      return NextResponse.json({ error: "Code is required" }, { status: 400 });
    }

    const existing = await Item.findOne({ Code: it.Code }).lean();
    if (existing) {
      return NextResponse.json(
        { error: `Item with Code "${it.Code}" already exists` },
        { status: 409 }
      );
    }

    const doc = await Item.create(it);
    return NextResponse.json(doc, { status: 201 });
  } catch (e) {
    console.error(e);
    if (e?.code === 11000) {
      return NextResponse.json({ error: "Duplicate Code" }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to create item" }, { status: 500 });
  }
}