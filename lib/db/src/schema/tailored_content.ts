import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { applicationsTable } from "./applications";

export const tailoredContentTable = pgTable("tailored_content", {
  id: serial("id").primaryKey(),
  applicationId: integer("application_id")
    .notNull()
    .references(() => applicationsTable.id, { onDelete: "cascade" })
    .unique(),
  resumeBullets: text("resume_bullets"),
  coverLetterParagraph: text("cover_letter_paragraph"),
  atsKeywords: text("ats_keywords"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertTailoredContentSchema = createInsertSchema(tailoredContentTable).omit({
  id: true,
  updatedAt: true,
});
export type InsertTailoredContent = z.infer<typeof insertTailoredContentSchema>;
export type TailoredContent = typeof tailoredContentTable.$inferSelect;
