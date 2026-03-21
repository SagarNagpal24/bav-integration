import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import Item from "@/models/Item";
import { normalizeItem } from "@/lib/helpers";

export async function GET(req, { params }) {
  try {
    await connectDB();
    await requireAuth();

    const code = String(params.code || "").trim();
    if (!code) {
      return NextResponse.json(
        { error: "Code is required in URL" },
        { status: 400 }
      );
    }

    const doc = await Item.findOne({ Code: code }).lean();
    if (!doc) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    return NextResponse.json(doc);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to fetch item" }, { status: 500 });
  }
}

export async function PUT(req, { params }) {
  try {
    await connectDB();
    await requireAuth();

    const code = String(params.code || "").trim();
    if (!code) {
      return NextResponse.json(
        { error: "Code is required in URL" },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(req.url);
    const upsert = searchParams.get("upsert") === "true";

    const body = await req.json();
    const update = normalizeItem({ ...body, Code: code });

    const doc = await Item.findOneAndUpdate(
      { Code: code },
      { $set: update },
      { new: true, upsert }
    ).lean();

    if (!doc && !upsert) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    return NextResponse.json(doc);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to update item" }, { status: 500 });
  }
}

export async function DELETE(req, { params }) {
  try {
    await connectDB();
    await requireAuth();

    const code = String(params.code || "").trim();
    if (!code) {
      return NextResponse.json(
        { error: "Code is required in URL" },
        { status: 400 }
      );
    }

    const out = await Item.findOneAndDelete({ Code: code }).lean();
    if (!out) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to delete item" }, { status: 500 });
  }
}