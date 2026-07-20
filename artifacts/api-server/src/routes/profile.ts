import { Router, type IRouter } from "express";
import { db, profileTable } from "@workspace/db";
import { UpsertProfileBody } from "@workspace/api-zod";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

router.get("/profile", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const [profile] = await db
    .select()
    .from(profileTable)
    .where(eq(profileTable.userId, userId))
    .limit(1);

  if (!profile) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }

  res.json(profile);
});

router.put("/profile", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const parsed = UpsertProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(profileTable)
    .where(eq(profileTable.userId, userId))
    .limit(1);

  let profile;
  if (existing) {
    [profile] = await db
      .update(profileTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(profileTable.userId, userId))
      .returning();
  } else {
    [profile] = await db
      .insert(profileTable)
      .values({ ...parsed.data, userId })
      .returning();
  }

  res.json(profile);
});

export default router;
