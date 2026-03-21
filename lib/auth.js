import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import { cookies } from "next/headers";

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export const getAllowedEmails = () =>
  new Set(
    String(process.env.ALLOWED_EMAILS || "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  );

export const createSessionToken = (user) => {
  return jwt.sign(
    {
      email: user.email,
      name: user.name || "",
      picture: user.picture || "",
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
};

export async function verifyGoogleCredential(credential) {
  const ticket = await googleClient.verifyIdToken({
    idToken: credential,
    audience: process.env.GOOGLE_CLIENT_ID,
  });

  const payload = ticket.getPayload();
  if (!payload) {
    throw new Error("Invalid Google token");
  }

  const email = String(payload.email || "").trim().toLowerCase();
  const emailVerified = !!payload.email_verified;

  if (!email || !emailVerified) {
    throw new Error("Google email not verified");
  }

  const allowedEmails = getAllowedEmails();
  if (!allowedEmails.has(email)) {
    throw new Error("Access denied. This account is not allowed.");
  }

  return {
    email,
    name: payload.name || "",
    picture: payload.picture || "",
  };
}

export function getUserFromToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

export async function requireAuth() {
  const cookieStore = await cookies();
  const token = cookieStore.get("bav_token")?.value;

  if (!token) {
    throw new Error("Unauthorized");
  }

  return getUserFromToken(token);
}