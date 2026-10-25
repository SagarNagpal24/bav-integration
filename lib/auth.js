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

// Read an env var as a set of clean, lower-cased emails. Strips surrounding
// quotes and whitespace, and splits on commas, so multiple addresses per var
// (e.g. ADMIN_EMAIL="a@x.com,b@x.com") are supported and still match Google
// account emails even when a dashboard value was pasted with quotes.
const envEmails = (name) =>
  new Set(
    String(process.env[name] || "")
      .split(",")
      .map((e) => e.trim().replace(/^["']|["']$/g, "").trim().toLowerCase())
      .filter(Boolean)
  );

export const getAllowedEmails = () =>
  new Set(
    ["SHOP_EMAIL", "STALL_EMAIL", "ADMIN_EMAIL", "ALLOWED_EMAILS"].flatMap(
      (name) => [...envEmails(name)]
    )
  );

export function getRoleForEmail(email) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) return null;
  if (envEmails("ADMIN_EMAIL").has(normalized)) return "admin";
  if (envEmails("SHOP_EMAIL").has(normalized)) return "shop";
  if (envEmails("STALL_EMAIL").has(normalized)) return "stall";
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
