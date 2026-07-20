import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required.");
}
const SECRET: string = JWT_SECRET;

const googleClient = process.env.GOOGLE_CLIENT_ID
  ? new OAuth2Client(process.env.GOOGLE_CLIENT_ID)
  : null;

const TOKEN_TTL = "30d";

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function signToken(userId: number): string {
  return jwt.sign({ userId }, SECRET, { expiresIn: TOKEN_TTL });
}

export function verifyToken(token: string): { userId: number } | null {
  try {
    const decoded = jwt.verify(token, SECRET);
    if (
      typeof decoded === "object" &&
      decoded !== null &&
      typeof (decoded as { userId?: unknown }).userId === "number"
    ) {
      return { userId: (decoded as { userId: number }).userId };
    }
    return null;
  } catch {
    return null;
  }
}

export interface GoogleProfile {
  googleId: string;
  email: string;
  name: string | null;
}

export async function verifyGoogleCredential(
  credential: string,
): Promise<GoogleProfile | null> {
  if (!googleClient || !process.env.GOOGLE_CLIENT_ID) return null;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email) return null;
    return {
      googleId: payload.sub,
      email: payload.email,
      name: payload.name ?? null,
    };
  } catch {
    return null;
  }
}
