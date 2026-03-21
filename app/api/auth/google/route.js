import { NextResponse } from "next/server";
import { verifyGoogleCredential, createSessionToken } from "@/lib/auth";

export async function POST(req) {
  try {
    const body = await req.json();
    const { credential } = body || {};

    if (!credential) {
      return NextResponse.json(
        { error: "Missing Google credential" },
        { status: 400 }
      );
    }

    const user = await verifyGoogleCredential(credential);
    const sessionToken = createSessionToken(user);

    const response = NextResponse.json({
      ok: true,
      message: "Login successful",
      user,
    });

    response.cookies.set("bav_token", sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 7 * 24 * 60 * 60,
      path: "/",
    });

    return response;
  } catch (e) {
    console.error("Google auth error:", e);
    return NextResponse.json(
      { error: e.message || "Authentication failed" },
      { status: 401 }
    );
  }
}