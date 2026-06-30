import {
  useQuery,
  useMutation,
  type UseQueryOptions,
} from "@tanstack/react-query";

// ─── Types (mirrors lib/api-spec/openapi.yaml) ───────────────────────────────
export type ApplicationStatus =
  | "Saved"
  | "Applied"
  | "Interviewing"
  | "Offer"
  | "Rejected"
  | "Withdrawn";

export type ApplicationInputStatus = ApplicationStatus;
export type ApplicationUpdateStatus = ApplicationStatus;

export interface Application {
  id: number;
  companyName: string;
  roleTitle: string;
  country?: string | null;
  jobPostingUrl?: string | null;
  jobDescription?: string | null;
  status: string;
  source: string;
  applicationMethod?: string | null;
  notes?: string | null;
  followUpDate?: string | null;
  dateAdded: string;
  dateApplied?: string | null;
}

export interface ApplicationInput {
  companyName: string;
  roleTitle: string;
  country?: string;
  jobPostingUrl?: string;
  jobDescription?: string;
  status?: ApplicationInputStatus;
  source?: string;
  applicationMethod?: string;
  notes?: string;
  followUpDate?: string;
  dateApplied?: string;
}

export type ApplicationUpdate = Partial<ApplicationInput> & {
  status?: ApplicationUpdateStatus;
};

export interface TailoredContent {
  id: number;
  applicationId: number;
  resumeBullets?: string | null;
  coverLetterParagraph?: string | null;
  atsKeywords?: string | null;
  updatedAt: string;
}

export interface TailoredContentInput {
  resumeBullets?: string;
  coverLetterParagraph?: string;
  atsKeywords?: string;
}

export interface DashboardStats {
  total: number;
  appliedThisWeek: number;
  upcomingFollowUps: number;
  overdueFollowUps: number;
  responseRate: number;
  byStatus: Record<string, number>;
}

export interface Profile {
  id: number;
  resumeText?: string | null;
  keySkills?: string | null;
  careerSummary?: string | null;
  pastRoles?: string | null;
  updatedAt: string;
}

export interface ProfileInput {
  resumeText?: string;
  keySkills?: string;
  careerSummary?: string;
  pastRoles?: string;
}

export interface TailorResult {
  resumeBullets: string;
  coverLetterParagraph: string;
  atsKeywords: string;
}

// ─── HTTP helper ─────────────────────────────────────────────────────────────
// Same-origin relative path. In dev, Vite proxies /api → the API server.
// In production, serve the frontend and API on the same origin (or add a proxy).
export class ApiError extends Error {
  status: number;
  data: unknown;
  constructor(status: number, data: unknown) {
    super(`Request failed with status ${status}`);
    this.status = status;
    this.data = data;
  }
}

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const json = text ? JSON.parse(text) : undefined;
  if (!res.ok) throw new ApiError(res.status, json);
  return json as T;
}

// ─── Query key helpers ───────────────────────────────────────────────────────
export const getListApplicationsQueryKey = () => ["/applications"] as const;
export const getGetApplicationQueryKey = (id: number) =>
  ["/applications", id] as const;
export const getGetTailoredContentQueryKey = (id: number) =>
  ["/applications", id, "tailored-content"] as const;
export const getGetDashboardStatsQueryKey = () => ["/dashboard/stats"] as const;
export const getGetOverdueFollowUpsQueryKey = () =>
  ["/dashboard/follow-ups"] as const;
export const getGetProfileQueryKey = () => ["/profile"] as const;

// Allow callers to pass `{ query: { ...useQuery options } }`
type QueryOpts<T> = {
  query?: Partial<UseQueryOptions<T, ApiError, T, readonly unknown[]>>;
};

// ─── Queries ─────────────────────────────────────────────────────────────────
export function useListApplications(options?: QueryOpts<Application[]>) {
  return useQuery<Application[], ApiError, Application[], readonly unknown[]>({
    queryKey: getListApplicationsQueryKey(),
    queryFn: () => http<Application[]>("/applications"),
    ...(options?.query as object),
  });
}

export function useGetApplication(
  id: number,
  options?: QueryOpts<Application>,
) {
  return useQuery<Application, ApiError, Application, readonly unknown[]>({
    queryKey: getGetApplicationQueryKey(id),
    queryFn: () => http<Application>(`/applications/${id}`),
    ...(options?.query as object),
  });
}

export function useGetTailoredContent(
  id: number,
  options?: QueryOpts<TailoredContent | null>,
) {
  return useQuery<
    TailoredContent | null,
    ApiError,
    TailoredContent | null,
    readonly unknown[]
  >({
    queryKey: getGetTailoredContentQueryKey(id),
    queryFn: async () => {
      try {
        return await http<TailoredContent>(
          `/applications/${id}/tailored-content`,
        );
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }
    },
    ...(options?.query as object),
  });
}

export function useGetDashboardStats(options?: QueryOpts<DashboardStats>) {
  return useQuery<DashboardStats, ApiError, DashboardStats, readonly unknown[]>({
    queryKey: getGetDashboardStatsQueryKey(),
    queryFn: () => http<DashboardStats>("/dashboard/stats"),
    ...(options?.query as object),
  });
}

export function useGetOverdueFollowUps(options?: QueryOpts<Application[]>) {
  return useQuery<Application[], ApiError, Application[], readonly unknown[]>({
    queryKey: getGetOverdueFollowUpsQueryKey(),
    queryFn: () => http<Application[]>("/dashboard/follow-ups"),
    ...(options?.query as object),
  });
}

export function useGetProfile(options?: QueryOpts<Profile | null>) {
  return useQuery<Profile | null, ApiError, Profile | null, readonly unknown[]>({
    queryKey: getGetProfileQueryKey(),
    queryFn: () => http<Profile | null>("/profile"),
    ...(options?.query as object),
  });
}

// ─── Mutations ───────────────────────────────────────────────────────────────
export function useCreateApplication() {
  return useMutation<Application, ApiError, { data: ApplicationInput }>({
    mutationFn: ({ data }) =>
      http<Application>("/applications", {
        method: "POST",
        body: JSON.stringify(data),
      }),
  });
}

export function useUpdateApplication() {
  return useMutation<
    Application,
    ApiError,
    { id: number; data: ApplicationUpdate }
  >({
    mutationFn: ({ id, data }) =>
      http<Application>(`/applications/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
  });
}

export function useDeleteApplication() {
  return useMutation<void, ApiError, { id: number }>({
    mutationFn: ({ id }) =>
      http<void>(`/applications/${id}`, { method: "DELETE" }),
  });
}

export function useUpdateApplicationStatus() {
  return useMutation<
    Application,
    ApiError,
    { id: number; data: { status: ApplicationUpdateStatus } }
  >({
    mutationFn: ({ id, data }) =>
      http<Application>(`/applications/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
  });
}

export function useSaveTailoredContent() {
  return useMutation<
    TailoredContent,
    ApiError,
    { id: number; data: TailoredContentInput }
  >({
    mutationFn: ({ id, data }) =>
      http<TailoredContent>(`/applications/${id}/tailored-content`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
  });
}

export function useTailorMaterials() {
  return useMutation<
    TailorResult,
    ApiError,
    { data: { applicationId: number } }
  >({
    mutationFn: ({ data }) =>
      http<TailorResult>("/ai/tailor", {
        method: "POST",
        body: JSON.stringify(data),
      }),
  });
}

export function useUpsertProfile() {
  return useMutation<Profile, ApiError, { data: ProfileInput }>({
    mutationFn: ({ data }) =>
      http<Profile>("/profile", {
        method: "PUT",
        body: JSON.stringify(data),
      }),
  });
}
