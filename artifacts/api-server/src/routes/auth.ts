import { Router, type IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { RegisterBody, LoginBody, GoogleAuthBody } from "@workspace/api-zod";
import {
  hashPassword,
  verifyPassword,
  signToken,
  verifyGoogleCredential,
} from "../lib/auth.js";
import { requireAuth } from "../middlewares/auth.js";

const router: IRouter = Router();

router.post("/auth/register", async (req, res): Promise<void> => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const username = parsed.data.username.toLowerCase();

  const [existing] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.username, username));
  if (existing) {
    res.status(409).json({ error: "Username already taken" });
    return;
  }

  const passwordHash = await hashPassword(parsed.data.password);
  const [user] = await db
    .insert(usersTable)
    .values({ username, passwordHash })
    .returning();

  const token = signToken(user.id);
  res.status(201).json({ token, user: { id: user.id, username: user.username } });
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const username = parsed.data.username.toLowerCase();

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.username, username));
  if (!user || !user.passwordHash) {
    res.status(401).json({ error: "Invalid username or password" });
    return;
  }

  const ok = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!ok) {
    res.status(401).json({ error: "Invalid username or password" });
    return;
  }

  const token = signToken(user.id);
  res.json({ token, user: { id: user.id, username: user.username } });
});

router.post("/auth/google", async (req, res): Promise<void> => {
  const parsed = GoogleAuthBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const profile = await verifyGoogleCredential(parsed.data.credential);
  if (!profile) {
    res.status(401).json({ error: "Invalid Google credential" });
    return;
  }

  const [byGoogleId] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.googleId, profile.googleId));

  if (byGoogleId) {
    const token = signToken(byGoogleId.id);
    res.json({ token, user: { id: byGoogleId.id, username: byGoogleId.username } });
    return;
  }

  const [byEmail] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, profile.email));

  if (byEmail) {
    // Existing password account signing in with Google for the first time — link it.
    const [linked] = await db
      .update(usersTable)
      .set({ googleId: profile.googleId })
      .where(eq(usersTable.id, byEmail.id))
      .returning();
    const token = signToken(linked.id);
    res.json({ token, user: { id: linked.id, username: linked.username } });
    return;
  }

  // New account — derive a unique username from the email local-part.
  const base = profile.email.split("@")[0].toLowerCase().replace(/[^a-z0-9_]/g, "_") || "user";
  let username = base;
  let suffix = 0;
  while (
    (await db.select().from(usersTable).where(eq(usersTable.username, username))).length > 0
  ) {
    suffix += 1;
    username = `${base}${suffix}`;
  }

  const [created] = await db
    .insert(usersTable)
    .values({ username, email: profile.email, googleId: profile.googleId })
    .returning();

  const token = signToken(created.id);
  res.status(201).json({ token, user: { id: created.id, username: created.username } });
});

router.get("/auth/me", requireAuth, async (req, res): Promise<void> => {
  const [user] = await db
    .select({ id: usersTable.id, username: usersTable.username })
    .from(usersTable)
    .where(eq(usersTable.id, req.userId!));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(user);
});

export default router;
