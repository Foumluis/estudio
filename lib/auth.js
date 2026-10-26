import crypto from "crypto";
import { cookies } from "next/headers";
import { get } from "@/lib/db";

const COOKIE = "estudio_session";
const MAX_AGE = 30 * 86400; // 30 días

// Secreto para firmar la cookie de sesión. Si no hay AUTH_SECRET se usa el
// token de Upstash, que ya es secreto y está presente en Vercel.
function secret() {
  const s =
    process.env.AUTH_SECRET ||
    process.env.KV_REST_API_TOKEN ||
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    (process.env.VERCEL ? null : "dev-secret-solo-local");
  if (!s) throw new Error("Falta configurar AUTH_SECRET.");
  return s;
}

const sign = (value) => crypto.createHmac("sha256", secret()).update(value).digest("base64url");

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString("hex")}`;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = (stored || "").split(":");
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = crypto.scryptSync(password, salt, 64);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

export async function startSession(userId) {
  const value = `${userId}.${Date.now() + MAX_AGE * 1000}`;
  (await cookies()).set(COOKIE, `${value}.${sign(value)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function endSession() {
  (await cookies()).delete(COOKIE);
}

export async function currentUser() {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const cut = raw.lastIndexOf(".");
  const value = raw.slice(0, cut);
  const given = Buffer.from(raw.slice(cut + 1));
  const expected = Buffer.from(sign(value));
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  const [id, exp] = value.split(".");
  if (Date.now() > Number(exp)) return null;
  return get("people", id);
}

export const publicUser = ({ passwordHash, ...user }) => user;
