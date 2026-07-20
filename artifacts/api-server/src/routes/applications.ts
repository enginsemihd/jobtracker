import { Router, type IRouter } from "express";
import { eq, desc, lte, and, isNotNull } from "drizzle-orm";
import { db, applicationsTable, tailoredContentTable } from "@workspace/db";
import {
  ListApplicationsQueryParams,
  CreateApplicationBody,
  GetApplicationParams,
  UpdateApplicationBody,
  DeleteApplicationParams,
  UpdateApplicationStatusParams,
  UpdateApplicationStatusBody,
  GetTailoredContentParams,
  SaveTailoredContentParams,
  SaveTailoredContentBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/applications", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const parsed = ListApplicationsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const conds = [eq(applicationsTable.userId, userId)];
  if (parsed.data.status) {
    conds.push(eq(applicationsTable.status, parsed.data.status));
  }

  const results = await db
    .select()
    .from(applicationsTable)
    .where(and(...conds))
    .orderBy(desc(applicationsTable.dateAdded));

  if (parsed.data.search) {
    const search = parsed.data.search.toLowerCase();
    const filtered = results.filter(
      (a) =>
        a.companyName.toLowerCase().includes(search) ||
        a.roleTitle.toLowerCase().includes(search)
    );
    res.json(filtered);
    return;
  }

  res.json(results);
});

router.post("/applications", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const parsed = CreateApplicationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [application] = await db
    .insert(applicationsTable)
    .values({
      ...parsed.data,
      userId,
      status: parsed.data.status ?? "Saved",
    })
    .returning();

  res.status(201).json(application);
});

router.get("/applications/:id", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetApplicationParams.safeParse({ id: parseInt(rawId, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [application] = await db
    .select()
    .from(applicationsTable)
    .where(
      and(
        eq(applicationsTable.id, params.data.id),
        eq(applicationsTable.userId, userId)
      )
    );

  if (!application) {
    res.status(404).json({ error: "Application not found" });
    return;
  }

  res.json(application);
});

router.patch("/applications/:id", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetApplicationParams.safeParse({ id: parseInt(rawId, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateApplicationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [application] = await db
    .update(applicationsTable)
    .set(parsed.data)
    .where(
      and(
        eq(applicationsTable.id, params.data.id),
        eq(applicationsTable.userId, userId)
      )
    )
    .returning();

  if (!application) {
    res.status(404).json({ error: "Application not found" });
    return;
  }

  res.json(application);
});

router.delete("/applications/:id", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = DeleteApplicationParams.safeParse({ id: parseInt(rawId, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [application] = await db
    .delete(applicationsTable)
    .where(
      and(
        eq(applicationsTable.id, params.data.id),
        eq(applicationsTable.userId, userId)
      )
    )
    .returning();

  if (!application) {
    res.status(404).json({ error: "Application not found" });
    return;
  }

  res.sendStatus(204);
});

router.patch("/applications/:id/status", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = UpdateApplicationStatusParams.safeParse({ id: parseInt(rawId, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateApplicationStatusBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [application] = await db
    .update(applicationsTable)
    .set({ status: parsed.data.status })
    .where(
      and(
        eq(applicationsTable.id, params.data.id),
        eq(applicationsTable.userId, userId)
      )
    )
    .returning();

  if (!application) {
    res.status(404).json({ error: "Application not found" });
    return;
  }

  res.json(application);
});

router.get("/applications/:id/tailored-content", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetTailoredContentParams.safeParse({ id: parseInt(rawId, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [app] = await db
    .select()
    .from(applicationsTable)
    .where(
      and(
        eq(applicationsTable.id, params.data.id),
        eq(applicationsTable.userId, userId)
      )
    );
  if (!app) {
    res.status(404).json({ error: "Application not found" });
    return;
  }

  const [content] = await db
    .select()
    .from(tailoredContentTable)
    .where(eq(tailoredContentTable.applicationId, params.data.id));

  if (!content) {
    res.status(404).json({ error: "Tailored content not found" });
    return;
  }

  res.json(content);
});

router.patch("/applications/:id/tailored-content", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = SaveTailoredContentParams.safeParse({ id: parseInt(rawId, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = SaveTailoredContentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [app] = await db
    .select()
    .from(applicationsTable)
    .where(
      and(
        eq(applicationsTable.id, params.data.id),
        eq(applicationsTable.userId, userId)
      )
    );

  if (!app) {
    res.status(404).json({ error: "Application not found" });
    return;
  }

  const [existing] = await db
    .select()
    .from(tailoredContentTable)
    .where(eq(tailoredContentTable.applicationId, params.data.id));

  let content;
  if (existing) {
    [content] = await db
      .update(tailoredContentTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(tailoredContentTable.applicationId, params.data.id))
      .returning();
  } else {
    [content] = await db
      .insert(tailoredContentTable)
      .values({ applicationId: params.data.id, ...parsed.data })
      .returning();
  }

  res.json(content);
});

router.get("/dashboard/stats", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const todayStr = now.toISOString().split("T")[0];

  const allApps = await db
    .select()
    .from(applicationsTable)
    .where(eq(applicationsTable.userId, userId));

  const total = allApps.length;
  const appliedThisWeek = allApps.filter(
    (a) => a.dateApplied && new Date(a.dateApplied) >= weekAgo
  ).length;

  const overdueFollowUps = allApps.filter(
    (a) => a.followUpDate && a.followUpDate < todayStr
  ).length;

  const upcomingFollowUps = allApps.filter(
    (a) =>
      a.followUpDate &&
      a.followUpDate >= todayStr &&
      a.followUpDate <=
        new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
  ).length;

  const responded = allApps.filter(
    (a) =>
      a.status === "Interviewing" || a.status === "Offer" || a.status === "Rejected"
  ).length;
  const applied = allApps.filter(
    (a) => a.status !== "Saved" && a.status !== "Withdrawn"
  ).length;
  const responseRate = applied > 0 ? Math.round((responded / applied) * 100) : 0;

  const byStatus: Record<string, number> = {};
  for (const app of allApps) {
    byStatus[app.status] = (byStatus[app.status] ?? 0) + 1;
  }

  res.json({
    total,
    appliedThisWeek,
    upcomingFollowUps,
    overdueFollowUps,
    responseRate,
    byStatus,
  });
});

router.get("/dashboard/follow-ups", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const todayStr = new Date().toISOString().split("T")[0];

  const overdue = await db
    .select()
    .from(applicationsTable)
    .where(
      and(
        eq(applicationsTable.userId, userId),
        isNotNull(applicationsTable.followUpDate),
        lte(applicationsTable.followUpDate, todayStr)
      )
    )
    .orderBy(applicationsTable.followUpDate);

  res.json(overdue);
});

export default router;
