import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import { cookies } from "next/headers";

let googleClient;

function getGoogleClient() {
  if (!googleClient) {
    googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
  }
  return googleClient;
}

export const getAllowedEmails = () =>
  new Set(
    [
      process.env.SHOP_EMAIL,
      process.env.STALL_EMAIL,
      process.env.ADMIN_EMAIL,
      process.env.ALLOWED_EMAILS,
    ]
      .flatMap((v) => String(v || "").split(","))
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  );

export function getRoleForEmail(email) {
  const normalized = String(email || "").trim().toLowerCase();
  if (normalized && normalized === String(process.env.ADMIN_EMAIL || "").trim().toLowerCase()) {
    return "admin";
  }
  if (normalized && normalized === String(process.env.SHOP_EMAIL || "").trim().toLowerCase()) {
    return "shop";
  }
  if (normalized && normalized === String(process.env.STALL_EMAIL || "").trim().toLowerCase()) {
    return "stall";
  }
  return null;
}

export function isAdminUser(user) {
  return user?.role === "admin";
}

export const createSessionToken = (user) => {
  return jwt.sign(
    {
      email: user.email,
      name: user.name || "",
      picture: user.picture || "",
      role: getRoleForEmail(user.email) || "",
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
};

export async function verifyGoogleCredential(credential) {
  const client = getGoogleClient();
  const ticket = await client.verifyIdToken({
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
    role: getRoleForEmail(email),
  };
}

export function getUserFromToken(token) {
  const payload = jwt.verify(token, process.env.JWT_SECRET);

  if (!payload.role) {
    payload.role = getRoleForEmail(payload.email);
  }

  return payload;
}

export async function requireAuth() {
  const cookieStore = await cookies();
  const token = cookieStore.get("bav_token")?.value;

  if (!token) {
    throw new Error("Unauthorized");
  }

  return getUserFromToken(token);
}

export async function requireAdmin() {
  const user = await requireAuth();

  if (user?.role !== "admin") {
    const err = new Error("Forbidden");
    err.statusCode = 403;
    throw err;
  }

  return user;
}
