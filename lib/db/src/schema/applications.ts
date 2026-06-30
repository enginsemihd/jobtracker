import { pgTable, text, serial, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const APPLICATION_STATUSES = [
  "Saved",
  "Applied",
  "Interviewing",
  "Offer",
  "Rejected",
  "Withdrawn",
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const APPLICATION_SOURCES = [
  "Manual",
  "Jooble",
  "Adzuna",
  "Remotive",
  "RemoteOK",
  "Greenhouse",
  "Lever",
] as const;

export type ApplicationSource = (typeof APPLICATION_SOURCES)[number];

export const applicationsTable = pgTable("applications", {
  id: serial("id").primaryKey(),
  companyName: text("company_name").notNull(),
  roleTitle: text("role_title").notNull(),
  country: text("country"),
  jobPostingUrl: text("job_posting_url"),
  jobDescription: text("job_description"),
  status: text("status").notNull().default("Saved"),
  source: text("source").notNull().default("Manual"),
  applicationMethod: text("application_method"),
  notes: text("notes"),
  followUpDate: date("follow_up_date", { mode: "string" }),
  dateAdded: timestamp("date_added", { withTimezone: true }).notNull().defaultNow(),
  dateApplied: date("date_applied", { mode: "string" }),
});

export const insertApplicationSchema = createInsertSchema(applicationsTable).omit({
  id: true,
  dateAdded: true,
});
export type InsertApplication = z.infer<typeof insertApplicationSchema>;
export type Application = typeof applicationsTable.$inferSelect;
