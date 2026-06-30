import { Router, type IRouter } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { db, applicationsTable, profileTable, tailoredContentTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { TailorMaterialsBody } from "@workspace/api-zod";
import { logger } from "../lib/logger";

// ============================================================
// SYSTEM PROMPT — edit this constant to tune Claude's tone and
// output format for resume/cover letter tailoring.
// ============================================================
const TAILOR_SYSTEM_PROMPT = `You are an expert career coach and resume writer. Your job is to help a job seeker tailor their application materials to a specific job posting.

Given the user's background (resume, skills, career summary, past roles) and a job description, you will produce three things:

1. RESUME BULLETS: 3-5 tailored resume bullet points that highlight the most relevant experience for this specific role. Each bullet should start with a strong action verb and include quantifiable results where possible. Format as a simple bulleted list using "•" characters.

2. COVER LETTER PARAGRAPH: A focused, specific cover letter opening paragraph (3-4 sentences). Do NOT write a generic letter — make it directly responsive to the job description. Reference specific requirements from the posting.

3. ATS KEYWORDS: A comma-separated list of 8-12 important keywords and phrases from the job posting that the candidate should ensure appear in their resume (for Applicant Tracking System matching). Focus on technical skills, tools, methodologies, and key phrases the employer used.

Be specific, direct, and professional. Do not add fluff or generic advice. Format your response exactly as:

RESUME BULLETS:
[bullet points]

COVER LETTER PARAGRAPH:
[paragraph]

ATS KEYWORDS:
[comma-separated keywords]`;

const router: IRouter = Router();

router.post("/ai/tailor", async (req, res): Promise<void> => {
  const parsed = TailorMaterialsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [application] = await db
    .select()
    .from(applicationsTable)
    .where(eq(applicationsTable.id, parsed.data.applicationId));

  if (!application) {
    res.status(404).json({ error: "Application not found" });
    return;
  }

  if (!application.jobDescription) {
    res.status(400).json({
      error: "This application has no job description. Please add one before tailoring.",
    });
    return;
  }

  const [profile] = await db.select().from(profileTable).limit(1);

  if (!profile || !profile.resumeText) {
    res.status(400).json({
      error:
        "No profile/resume found. Please fill in your profile with your resume text before using AI tailoring.",
    });
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

  const userMessage = `
## My Background

**Resume:**
${profile.resumeText}

${profile.keySkills ? `**Key Skills:**\n${profile.keySkills}\n` : ""}
${profile.careerSummary ? `**Career Summary:**\n${profile.careerSummary}\n` : ""}
${profile.pastRoles ? `**Past Roles:**\n${profile.pastRoles}\n` : ""}

## Job I'm Applying For

**Company:** ${application.companyName}
**Role:** ${application.roleTitle}

**Job Description:**
${application.jobDescription}
`;

  req.log.info(
    { applicationId: application.id, company: application.companyName },
    "Running AI tailoring"
  );

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8192,
    system: TAILOR_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  const responseText =
    message.content[0]?.type === "text" ? message.content[0].text : "";

  const resumeBulletsMatch = responseText.match(
    /RESUME BULLETS:\s*([\s\S]*?)(?=COVER LETTER PARAGRAPH:|$)/i
  );
  const coverLetterMatch = responseText.match(
    /COVER LETTER PARAGRAPH:\s*([\s\S]*?)(?=ATS KEYWORDS:|$)/i
  );
  const atsKeywordsMatch = responseText.match(/ATS KEYWORDS:\s*([\s\S]*?)$/i);

  const resumeBullets = resumeBulletsMatch?.[1]?.trim() ?? "";
  const coverLetterParagraph = coverLetterMatch?.[1]?.trim() ?? "";
  const atsKeywords = atsKeywordsMatch?.[1]?.trim() ?? "";

  // Auto-save the tailored content
  const [existing] = await db
    .select()
    .from(tailoredContentTable)
    .where(eq(tailoredContentTable.applicationId, application.id));

  if (existing) {
    await db
      .update(tailoredContentTable)
      .set({ resumeBullets, coverLetterParagraph, atsKeywords, updatedAt: new Date() })
      .where(eq(tailoredContentTable.applicationId, application.id));
  } else {
    await db
      .insert(tailoredContentTable)
      .values({ applicationId: application.id, resumeBullets, coverLetterParagraph, atsKeywords });
  }

  res.json({ resumeBullets, coverLetterParagraph, atsKeywords });
});

export default router;
