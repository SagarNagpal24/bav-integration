import mongoose from "mongoose";
import dns, { promises as dnsPromises } from "dns";

const CACHE_VERSION = 2;

let cached = global.mongoose;

if (!cached || cached.version !== CACHE_VERSION) {
  cached = global.mongoose = {
    version: CACHE_VERSION,
    conn: null,
    promise: null,
  };
}

let dnsFallbackApplied = false;

const getSrvHost = (uri) =>
  uri
    .slice("mongodb+srv://".length)
    .split("/")[0]
    .split("?")[0]
    .split("@")
    .pop();

async function ensureSrvResolvable(uri) {
  if (dnsFallbackApplied) return;
  if (!uri.startsWith("mongodb+srv://")) return;

  const host = getSrvHost(uri);
  if (!host) return;

  try {
    await dnsPromises.resolveSrv(`_mongodb._tcp.${host}`);
  } catch (e) {
    try {
      dns.setServers(["8.8.8.8", "1.1.1.1"]);
      await dnsPromises.resolveSrv(`_mongodb._tcp.${host}`);
      dnsFallbackApplied = true;
      console.warn(
        "MongoDB SRV lookup failed with system DNS; using 8.8.8.8/1.1.1.1 as fallback."
      );
    } catch {
      // Keep default resolvers; let mongoose surface the real error.
    }
  }
}

export async function connectDB() {
  if (cached.conn) return cached.conn;

  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) {
    throw new Error("Please define MONGODB_URI in environment variables");
  }

  if (!cached.promise) {
    cached.promise = (async () => {
      await ensureSrvResolvable(MONGODB_URI);
      return mongoose.connect(MONGODB_URI, { bufferCommands: false });
    })().catch((err) => {
      cached.promise = null;
      throw err;
    });
  }

  cached.conn = await cached.promise;
  return cached.conn;
}
