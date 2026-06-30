import { z } from "zod";

// Shared
export const STATUS_VALUES = [
  "Saved",
  "Applied",
  "Interviewing",
  "Offer",
  "Rejected",
  "Withdrawn",
] as const;
export const StatusEnum = z.enum(STATUS_VALUES);

// Health
export const HealthCheckResponse = z.object({ status: z.string() });

// Applications — list
export const ListApplicationsQueryParams = z.object({
  status: z.string().optional(),
  search: z.string().optional(),
});

// Applications — create
export const CreateApplicationBody = z.object({
  companyName: z.string().min(1),
  roleTitle: z.string().min(1),
  country: z.string().optional(),
  jobPostingUrl: z.string().optional(),
  jobDescription: z.string().optional(),
  status: StatusEnum.optional(),
  source: z.string().optional(),
  applicationMethod: z.string().optional(),
  notes: z.string().optional(),
  followUpDate: z.string().optional(),
  dateApplied: z.string().optional(),
});

// Applications — path params
export const GetApplicationParams = z.object({ id: z.number().int() });
export const DeleteApplicationParams = z.object({ id: z.number().int() });
export const UpdateApplicationStatusParams = z.object({ id: z.number().int() });
export const GetTailoredContentParams = z.object({ id: z.number().int() });
export const SaveTailoredContentParams = z.object({ id: z.number().int() });

// Applications — update (all optional)
export const UpdateApplicationBody = z.object({
  companyName: z.string().optional(),
  roleTitle: z.string().optional(),
  country: z.string().optional(),
  jobPostingUrl: z.string().optional(),
  jobDescription: z.string().optional(),
  status: StatusEnum.optional(),
  source: z.string().optional(),
  applicationMethod: z.string().optional(),
  notes: z.string().optional(),
  followUpDate: z.string().optional(),
  dateApplied: z.string().optional(),
});

// Status-only update (Kanban drag-and-drop)
export const UpdateApplicationStatusBody = z.object({ status: StatusEnum });

// Tailored content save
export const SaveTailoredContentBody = z.object({
  resumeBullets: z.string().optional(),
  coverLetterParagraph: z.string().optional(),
  atsKeywords: z.string().optional(),
});

// Profile upsert
export const UpsertProfileBody = z.object({
  resumeText: z.string().optional(),
  keySkills: z.string().optional(),
  careerSummary: z.string().optional(),
  pastRoles: z.string().optional(),
});

// AI tailor request
export const TailorMaterialsBody = z.object({ applicationId: z.number().int() });

// Job search query
export const SearchJobsQueryParams = z.object({
  keyword: z.string().min(1),
  country: z.string().optional(),
  remote: z.enum(["true", "false"]).optional(),
});
