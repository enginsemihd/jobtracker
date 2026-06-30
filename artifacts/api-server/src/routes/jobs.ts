import { Router, type IRouter } from "express";
import { SearchJobsQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

// ─── In-memory cache (5-minute TTL) ─────────────────────────────────────────
const cache = new Map<string, { data: JobListing[]; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

// ─── Pagination / fetch-all controls ────────────────────────────────────────
// Configurable via env so a broad multi-country search can't run forever or
// blow through API rate limits. Defaults: up to 10 pages OR 500 results per
// source, whichever comes first.
const MAX_PAGES_PER_SOURCE = Number(process.env.JOBS_MAX_PAGES ?? 10);
const MAX_RESULTS_PER_SOURCE = Number(process.env.JOBS_MAX_RESULTS_PER_SOURCE ?? 500);
const PAGE_SIZE = 20;
const PAGE_DELAY_MS = Number(process.env.JOBS_PAGE_DELAY_MS ?? 250);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface JobListing {
  id: string;
  title: string;
  company: string;
  location: string;
  country: string | null;
  salary: string | null;
  source: "Jooble" | "Adzuna" | "Remotive" | "RemoteOK" | "ISKUR";
  postedAt: string | null;
  jobUrl: string;
  snippet: string | null;
  isRemote: boolean;
}

// ─── Jooble (paginated: `page` in POST body, 1-indexed) ──────────────────────
// Primary source for Turkey. Jooble returns `totalCount`; we loop pages until
// we've collected everything, hit a cap, or get an empty/short page.
async function fetchJooble(keyword: string, country: string, remoteOnly: boolean): Promise<JobListing[]> {
  const apiKey = process.env.JOOBLE_API_KEY;
  if (!apiKey) return [];

  const location = remoteOnly ? "Remote" : country;
  const out: JobListing[] = [];

  try {
    for (let page = 1; page <= MAX_PAGES_PER_SOURCE; page++) {
      const res = await fetch(`https://jooble.org/api/${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keywords: keyword, location, page, resultsOnPage: PAGE_SIZE }),
        signal: AbortSignal.timeout(8000),
      });
      // Stop this source gracefully on rate-limit / error mid-pagination,
      // keeping whatever we already collected.
      if (!res.ok) break;

      const data = (await res.json()) as {
        totalCount?: number;
        jobs?: Array<{
          id?: string; title?: string; company?: string; location?: string;
          salary?: string; updated?: string; link?: string; snippet?: string;
        }>;
      };

      const jobs = data.jobs ?? [];
      if (jobs.length === 0) break;

      for (const j of jobs) {
        if (!j.link) continue;
        out.push({
          id: `jooble-${j.id ?? `${page}-${out.length}`}`,
          title: j.title ?? "",
          company: j.company ?? "",
          location: j.location ?? "",
          country: country || null,
          salary: j.salary || null,
          source: "Jooble",
          postedAt: j.updated || null,
          jobUrl: j.link,
          snippet: j.snippet || null,
          isRemote: remoteOnly || /remote/i.test(j.location ?? ""),
        });
      }

      // Stop conditions: hit result cap, reached known total, or short page.
      if (out.length >= MAX_RESULTS_PER_SOURCE) break;
      if (typeof data.totalCount === "number" && out.length >= data.totalCount) break;
      if (jobs.length < PAGE_SIZE) break;

      await sleep(PAGE_DELAY_MS);
    }
  } catch {
    // network/abort — return what we have
  }

  return out.slice(0, MAX_RESULTS_PER_SOURCE);
}

// ─── Adzuna (paginated: page in URL path; does NOT cover Turkey) ─────────────
const ADZUNA_COUNTRY_CODES: Record<string, string> = {
  "united kingdom": "gb", "uk": "gb",
  "germany": "de", "france": "fr", "netherlands": "nl", "poland": "pl",
  "italy": "it", "spain": "es", "austria": "at", "belgium": "be",
  "switzerland": "ch", "australia": "au", "canada": "ca", "usa": "us",
  "united states": "us", "russia": "ru", "brazil": "br", "india": "in",
  "new zealand": "nz", "singapore": "sg", "south africa": "za",
};

// Countries Adzuna has no dataset for. Turkey is the important one here —
// we skip Adzuna entirely for these and rely on Jooble.
function adzunaSupports(country: string): boolean {
  if (!country) return true; // no country → default GB search is fine
  return ADZUNA_COUNTRY_CODES[country.toLowerCase()] !== undefined;
}

async function fetchAdzuna(keyword: string, country: string, remoteOnly: boolean): Promise<JobListing[]> {
  const appId = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;
  if (!appId || !appKey) return [];
  if (!adzunaSupports(country)) return []; // e.g. Turkey

  const code = ADZUNA_COUNTRY_CODES[country.toLowerCase()] ?? "gb";
  const out: JobListing[] = [];

  try {
    for (let page = 1; page <= MAX_PAGES_PER_SOURCE; page++) {
      const params = new URLSearchParams({
        app_id: appId,
        app_key: appKey,
        results_per_page: String(PAGE_SIZE),
        what: keyword,
        ...(remoteOnly ? { where: "remote" } : {}),
      });
      const res = await fetch(
        `https://api.adzuna.com/v1/api/jobs/${code}/search/${page}?${params}`,
        { signal: AbortSignal.timeout(8000) }
      );
      if (!res.ok) break;

      const data = (await res.json()) as {
        count?: number;
        results?: Array<{
          id?: string; title?: string; company?: { display_name?: string };
          location?: { display_name?: string }; salary_min?: number; salary_max?: number;
          created?: string; redirect_url?: string; description?: string;
        }>;
      };

      const results = data.results ?? [];
      if (results.length === 0) break;

      for (const j of results) {
        if (!j.redirect_url) continue;
        const salaryMin = j.salary_min ? Math.round(j.salary_min) : null;
        const salaryMax = j.salary_max ? Math.round(j.salary_max) : null;
        const salary = salaryMin && salaryMax
          ? `${salaryMin.toLocaleString()} – ${salaryMax.toLocaleString()}`
          : salaryMin
          ? `${salaryMin.toLocaleString()}+`
          : null;

        out.push({
          id: `adzuna-${j.id ?? `${page}-${out.length}`}`,
          title: j.title ?? "",
          company: j.company?.display_name ?? "",
          location: j.location?.display_name ?? country,
          country: country || null,
          salary,
          source: "Adzuna",
          postedAt: j.created || null,
          jobUrl: j.redirect_url,
          snippet: j.description?.slice(0, 300) || null,
          isRemote: remoteOnly || /remote/i.test(j.location?.display_name ?? ""),
        });
      }

      if (out.length >= MAX_RESULTS_PER_SOURCE) break;
      if (typeof data.count === "number" && out.length >= data.count) break;
      if (results.length < PAGE_SIZE) break;

      await sleep(PAGE_DELAY_MS);
    }
  } catch {
    // return what we have
  }

  return out.slice(0, MAX_RESULTS_PER_SOURCE);
}

// ─── İŞKUR (Turkish government employment agency) ────────────────────────────
// Placeholder. İŞKUR (iskur.gov.tr) does not expose a documented public REST
// API for job listings at time of writing. We intentionally do NOT scrape it.
// If/when an official open-data endpoint becomes available, implement the fetch
// here (it would be the safest possible Turkey source — government data) and
// add "ISKUR" to the sources wired into the route below.
async function fetchIskur(_keyword: string, _country: string): Promise<JobListing[]> {
  return [];
}

// ─── Remotive (single call, raise limit to act as fetch-all) ─────────────────
async function fetchRemotive(keyword: string): Promise<JobListing[]> {
  try {
    const params = new URLSearchParams({ search: keyword, limit: String(MAX_RESULTS_PER_SOURCE) });
    const res = await fetch(`https://remotive.com/api/remote-jobs?${params}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { jobs?: Array<{
      id?: number; title?: string; company_name?: string; candidate_required_location?: string;
      salary?: string; publication_date?: string; url?: string; description?: string;
    }> };

    return (data.jobs ?? []).map((j) => ({
      id: `remotive-${j.id ?? Math.random()}`,
      title: j.title ?? "",
      company: j.company_name ?? "",
      location: j.candidate_required_location || "Remote",
      country: null,
      salary: j.salary || null,
      source: "Remotive" as const,
      postedAt: j.publication_date || null,
      jobUrl: j.url ?? "",
      snippet: j.description?.replace(/<[^>]+>/g, "").slice(0, 300) || null,
      isRemote: true,
    })).filter((j) => j.jobUrl).slice(0, MAX_RESULTS_PER_SOURCE);
  } catch {
    return [];
  }
}

// ─── RemoteOK (single feed, raise slice to act as fetch-all) ─────────────────
async function fetchRemoteOK(keyword: string): Promise<JobListing[]> {
  try {
    const tag = keyword.toLowerCase().replace(/\s+/g, "-");
    const res = await fetch(`https://remoteok.com/api?tags=${encodeURIComponent(tag)}`, {
      headers: { "User-Agent": "JobTrack/1.0 (personal job search app)" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as Array<{
      slug?: string; position?: string; company?: string; location?: string;
      salary_min?: number; salary_max?: number; date?: string; url?: string; description?: string;
      legal?: string;
    }>;

    return data
      .filter((j) => j.position && j.url && !j.legal)
      .slice(0, MAX_RESULTS_PER_SOURCE)
      .map((j) => {
        const salary = j.salary_min && j.salary_max
          ? `$${j.salary_min.toLocaleString()} – $${j.salary_max.toLocaleString()}`
          : null;
        return {
          id: `remoteok-${j.slug ?? Math.random()}`,
          title: j.position ?? "",
          company: j.company ?? "",
          location: j.location || "Remote",
          country: null,
          salary,
          source: "RemoteOK" as const,
          postedAt: j.date || null,
          jobUrl: j.url ?? "",
          snippet: j.description?.replace(/<[^>]+>/g, "").slice(0, 300) || null,
          isRemote: true,
        };
      });
  } catch {
    return [];
  }
}

// ─── De-duplicate by company+title+location ───────────────────────────────────
function deduplicate(listings: JobListing[]): JobListing[] {
  const seen = new Set<string>();
  return listings.filter((j) => {
    const key = `${j.company.toLowerCase().trim()}|${j.title.toLowerCase().trim()}|${j.location.toLowerCase().trim()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── Route ───────────────────────────────────────────────────────────────────
router.get("/jobs/search", async (req, res): Promise<void> => {
  const parsed = SearchJobsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { keyword, country = "", remote } = parsed.data;
  const remoteOnly = remote === "true";

  // Cache key includes the per-source cap so cached results stay consistent
  // if the cap is ever changed via env.
  const cacheKey = `${keyword}|${country}|${remoteOnly}|${MAX_PAGES_PER_SOURCE}|${MAX_RESULTS_PER_SOURCE}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    res.json(cached.data);
    return;
  }

  const shouldFetchRemote = remoteOnly || !country;
  const isTurkey = country.toLowerCase() === "turkey";

  // Each source paginates internally; we run the sources in parallel.
  const [jooble, adzuna, iskur, remotive, remoteOK] = await Promise.allSettled([
    fetchJooble(keyword, country, remoteOnly),
    fetchAdzuna(keyword, country, remoteOnly),
    isTurkey ? fetchIskur(keyword, country) : Promise.resolve([]),
    shouldFetchRemote ? fetchRemotive(keyword) : Promise.resolve([]),
    shouldFetchRemote ? fetchRemoteOK(keyword) : Promise.resolve([]),
  ]);

  const all: JobListing[] = [
    ...(jooble.status === "fulfilled" ? jooble.value : []),
    ...(adzuna.status === "fulfilled" ? adzuna.value : []),
    ...(iskur.status === "fulfilled" ? iskur.value : []),
    ...(remotive.status === "fulfilled" ? remotive.value : []),
    ...(remoteOK.status === "fulfilled" ? remoteOK.value : []),
  ];

  const results = deduplicate(all);
  cache.set(cacheKey, { data: results, expiresAt: Date.now() + CACHE_TTL_MS });

  res.json(results);
});

export default router;
