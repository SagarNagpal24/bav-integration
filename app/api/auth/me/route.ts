import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

export async function GET() {
  try {
    const user = await requireAuth();

    return NextResponse.json({
      ok: true,
      user,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }
}