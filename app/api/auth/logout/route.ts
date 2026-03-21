import { NextResponse } from "next/server";

export async function POST(_req: Request) {
  const response = NextResponse.json({
    ok: true,
    message: "Logged out successfully",
  });

  response.cookies.set("bav_token", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    maxAge: 0,
    path: "/",
  });

  return response;
}