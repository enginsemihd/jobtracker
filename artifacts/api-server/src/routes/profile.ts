import { Router, type IRouter } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { db, profileTable } from "@workspace/db";
import { UpsertProfileBody, ParseCvBody } from "@workspace/api-zod";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

// ============================================================
// SYSTEM PROMPT — edit this constant to tune how CV uploads get
// parsed into the four Profile fields.
// ============================================================
const CV_PARSE_SYSTEM_PROMPT = `You extract structured profile data from an uploaded resume/CV PDF for a job-tracking app.

Read the PDF and respond with ONLY a valid JSON object — no markdown code fences, no commentary before or after — in exactly this shape:

{
  "resumeText": "the full resume content re-flowed as clean plain text, preserving every section and detail from the original",
  "keySkills": "a comma-separated list of the candidate's technical and professional skills",
  "careerSummary": "a short paragraph describing their professional identity and goals — lift it from the CV's own summary/objective section if present, otherwise synthesize one from their experience",
  "pastRoles": "each past role as \\"Title at Company (dates): key achievements\\", with a blank line between roles"
}

If the PDF has no readable resume content (blank, corrupted, or not actually a resume), respond with exactly {"error": "unreadable"} instead of the shape above.`;

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

interface ParsedCvFields {
  resumeText?: string;
  keySkills?: string;
  careerSummary?: string;
  pastRoles?: string;
  error?: string;
}

router.post("/profile/parse-cv", async (req, res): Promise<void> => {
  const parsed = ParseCvBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { fileBase64 } = parsed.data;

  let buffer: Buffer;
  try {
    buffer = Buffer.from(fileBase64, "base64");
  } catch {
    res.status(400).json({ error: "Invalid file data" });
    return;
  }

  if (buffer.length === 0 || buffer.length > 8 * 1024 * 1024) {
    res.status(400).json({ error: "File must be a PDF under 8MB" });
    return;
  }

  if (buffer.subarray(0, 5).toString("latin1") !== "%PDF-") {
    res.status(400).json({ error: "File must be a PDF" });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({
      error: "ANTHROPIC_API_KEY is not configured. Please add it in your environment secrets.",
    });
    return;
  }

  const anthropic = new Anthropic({ apiKey });

  req.log.info({ fileSizeBytes: buffer.length }, "Parsing uploaded CV");

  let responseText: string;
  try {
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      system: CV_PARSE_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: fileBase64 } },
            { type: "text", text: "Extract this resume into the JSON shape described in your instructions." },
          ],
        },
      ],
    });
    responseText = message.content[0]?.type === "text" ? message.content[0].text : "";
  } catch (err) {
    req.log.error({ err }, "CV parse request to Claude failed");
    res.status(502).json({ error: "Couldn't reach the AI service to parse this CV. Please try again." });
    return;
  }

  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  let fields: ParsedCvFields | null = null;
  if (jsonMatch) {
    try {
      fields = JSON.parse(jsonMatch[0]) as ParsedCvFields;
    } catch {
      fields = null;
    }
  }

  if (fields?.error) {
    res.status(422).json({
      error: "Couldn't read this PDF — it may be scanned, corrupted, or not a resume. Try a different file, or paste your resume text manually below.",
    });
    return;
  }

  if (!fields) {
    // JSON parsing failed but we still have raw text — better to hand the
    // user something to clean up than to fail the whole upload.
    res.json({ resumeText: responseText.slice(0, 20000), keySkills: "", careerSummary: "", pastRoles: "" });
    return;
  }

  res.json({
    resumeText: fields.resumeText ?? "",
    keySkills: fields.keySkills ?? "",
    careerSummary: fields.careerSummary ?? "",
    pastRoles: fields.pastRoles ?? "",
  });
});

export default router;
