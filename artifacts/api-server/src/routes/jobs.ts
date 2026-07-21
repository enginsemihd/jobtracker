import { Router, type IRouter } from "express";
import * as cheerio from "cheerio";
import { SearchJobsQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

// ─── In-memory cache (5-minute TTL) ─────────────────────────────────────────
const cache = new Map<string, { data: JobListing[]; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

// ─── Pagination / fetch-all controls ────────────────────────────────────────
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
  source: "Jooble" | "Adzuna" | "Remotive" | "RemoteOK" | "ISKUR" | "LinkedIn" | "Arbeitnow" | "Jobicy" | "Reed" | "Himalayas" | "Findwork";
  postedAt: string | null;
  jobUrl: string;
  snippet: string | null;
  isRemote: boolean;
}

// ─── Jooble (paginated: `page` in POST body, 1-indexed) ──────────────────────
async function fetchJooble(keyword: string, country: string, remoteOnly: boolean, city?: string): Promise<JobListing[]> {
  const apiKey = process.env.JOOBLE_API_KEY;
  if (!apiKey) return [];

  const location = remoteOnly ? "Remote" : (city ? `${city}, ${country}`.replace(/^, /, "") : country);
  const out: JobListing[] = [];

  try {
    for (let page = 1; page <= MAX_PAGES_PER_SOURCE; page++) {
      const res = await fetch(`https://jooble.org/api/${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keywords: keyword, location, page, resultsOnPage: PAGE_SIZE }),
        signal: AbortSignal.timeout(8000),
      });
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

function adzunaSupports(country: string): boolean {
  if (!country) return true;
  return ADZUNA_COUNTRY_CODES[country.toLowerCase()] !== undefined;
}

const ADZUNA_JOB_TYPE: Record<string, Record<string, string>> = {
  "full-time":  { full_time: "1" },
  "part-time":  { part_time: "1" },
  "contract":   { contract:  "1" },
  // Adzuna has no internship filter — we fall back to keyword-based
};

async function fetchAdzuna(
  keyword: string, country: string, remoteOnly: boolean,
  maxDaysOld?: number, city?: string, jobType?: string,
): Promise<JobListing[]> {
  const appId = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;
  if (!appId || !appKey) return [];
  if (!adzunaSupports(country)) return [];

  const code = ADZUNA_COUNTRY_CODES[country.toLowerCase()] ?? "gb";
  const where = remoteOnly ? "remote" : (city ?? undefined);
  // For internship Adzuna has no filter — append to keyword so results are still relevant
  const what = jobType === "internship" ? `${keyword} internship` : keyword;
  const typeParams = jobType ? (ADZUNA_JOB_TYPE[jobType] ?? {}) : {};
  const out: JobListing[] = [];

  try {
    for (let page = 1; page <= MAX_PAGES_PER_SOURCE; page++) {
      const params = new URLSearchParams({
        app_id: appId,
        app_key: appKey,
        results_per_page: String(PAGE_SIZE),
        what,
        ...(where ? { where } : {}),
        ...(maxDaysOld !== undefined ? { max_days_old: String(maxDaysOld) } : {}),
        ...typeParams,
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
          : salaryMin ? `${salaryMin.toLocaleString()}+` : null;

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
    // RemoteOK accepts comma-separated tags. Split the keyword into individual
    // words so "data engineer" becomes "data,engineer" rather than the single
    // non-existent tag "data-engineer".
    const tags = keyword.toLowerCase().trim().split(/\s+/).join(",");
    const res = await fetch(`https://remoteok.com/api?tags=${encodeURIComponent(tags)}`, {
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

// ─── Arbeitnow (official public API, no key required).
// Despite the name suggesting "Europe-focused", its `search`/`location` query
// params don't actually filter by location server-side at all (verified: an
// unfiltered Poland-location scan across 300 live listings found 0 Poland
// matches — the catalog is effectively Germany-only). We filter client-side
// on the returned `location` string against the requested city/country. ────
async function fetchArbeitnow(keyword: string, remoteOnly: boolean, country?: string, city?: string): Promise<JobListing[]> {
  const out: JobListing[] = [];
  const locationTerms = [city, country].filter((v): v is string => !!v).map((v) => v.toLowerCase());

  try {
    for (let page = 1; page <= MAX_PAGES_PER_SOURCE; page++) {
      const params = new URLSearchParams({ search: keyword, page: String(page) });
      const res = await fetch(`https://www.arbeitnow.com/api/job-board-api?${params}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) break;

      const data = (await res.json()) as {
        data?: Array<{
          slug?: string; title?: string; company_name?: string; location?: string;
          remote?: boolean; url?: string; tags?: string[]; created_at?: number;
          description?: string;
        }>;
      };

      const jobs = data.data ?? [];
      if (jobs.length === 0) break;

      for (const j of jobs) {
        if (!j.url) continue;
        if (remoteOnly && !j.remote) continue;
        if (!remoteOnly && locationTerms.length && !locationTerms.some((t) => (j.location ?? "").toLowerCase().includes(t))) continue;
        out.push({
          id: `arbeitnow-${j.slug ?? `${page}-${out.length}`}`,
          title: j.title ?? "",
          company: j.company_name ?? "",
          location: j.location || "",
          country: null,
          salary: null,
          source: "Arbeitnow",
          postedAt: j.created_at ? new Date(j.created_at * 1000).toISOString() : null,
          jobUrl: j.url,
          snippet: j.description?.replace(/<[^>]+>/g, "").slice(0, 300) || null,
          isRemote: !!j.remote,
        });
      }

      if (out.length >= MAX_RESULTS_PER_SOURCE) break;
      if (jobs.length < PAGE_SIZE) break;

      await sleep(PAGE_DELAY_MS);
    }
  } catch {
    // network/abort — return what we have
  }

  return out.slice(0, MAX_RESULTS_PER_SOURCE);
}

// ─── Jobicy (official public API, no key required; remote jobs) ──────────────
async function fetchJobicy(keyword: string): Promise<JobListing[]> {
  try {
    const params = new URLSearchParams({ count: "50", tag: keyword });
    const res = await fetch(`https://jobicy.com/api/v2/remote-jobs?${params}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];

    const data = (await res.json()) as {
      jobs?: Array<{
        id?: number; url?: string; jobTitle?: string; companyName?: string;
        jobGeo?: string; pubDate?: string; jobExcerpt?: string;
      }>;
    };

    return (data.jobs ?? [])
      .filter((j) => j.url && j.jobTitle)
      .slice(0, MAX_RESULTS_PER_SOURCE)
      .map((j) => ({
        id: `jobicy-${j.id ?? Math.random()}`,
        title: j.jobTitle ?? "",
        company: j.companyName ?? "",
        location: j.jobGeo || "Remote",
        country: null,
        salary: null,
        source: "Jobicy" as const,
        postedAt: j.pubDate || null,
        jobUrl: j.url ?? "",
        snippet: j.jobExcerpt || null,
        isRemote: true,
      }));
  } catch {
    return [];
  }
}

// ─── Reed (official UK jobs API; free key, basic auth as username) ───────────
async function fetchReed(keyword: string, remoteOnly: boolean, city?: string): Promise<JobListing[]> {
  const apiKey = process.env.REED_API_KEY;
  if (!apiKey) return [];

  const out: JobListing[] = [];
  const auth = Buffer.from(`${apiKey}:`).toString("base64");
  const RESULTS_PER_PAGE = 100;

  try {
    for (let page = 0; page < MAX_PAGES_PER_SOURCE; page++) {
      const params = new URLSearchParams({
        keywords: keyword,
        resultsToTake: String(RESULTS_PER_PAGE),
        resultsToSkip: String(page * RESULTS_PER_PAGE),
      });
      if (city) params.set("locationName", city);
      if (remoteOnly) params.set("fullTime", "true");

      const res = await fetch(`https://www.reed.co.uk/api/1.0/search?${params}`, {
        headers: { Authorization: `Basic ${auth}` },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) break;

      const data = (await res.json()) as {
        totalResults?: number;
        results?: Array<{
          jobId?: number; jobTitle?: string; employerName?: string; locationName?: string;
          minimumSalary?: number; maximumSalary?: number; currency?: string;
          date?: string; jobUrl?: string; jobDescription?: string;
        }>;
      };

      const jobs = data.results ?? [];
      if (jobs.length === 0) break;

      for (const j of jobs) {
        if (!j.jobUrl) continue;
        const salary = j.minimumSalary && j.maximumSalary
          ? `${j.currency ?? "GBP"} ${j.minimumSalary.toLocaleString()} – ${j.maximumSalary.toLocaleString()}`
          : j.minimumSalary ? `${j.currency ?? "GBP"} ${j.minimumSalary.toLocaleString()}+` : null;

        out.push({
          id: `reed-${j.jobId ?? `${page}-${out.length}`}`,
          title: j.jobTitle ?? "",
          company: j.employerName ?? "",
          location: j.locationName || "UK",
          country: "United Kingdom",
          salary,
          source: "Reed",
          postedAt: j.date || null,
          jobUrl: j.jobUrl,
          snippet: j.jobDescription?.slice(0, 300) || null,
          isRemote: remoteOnly || /remote/i.test(j.locationName ?? ""),
        });
      }

      if (out.length >= MAX_RESULTS_PER_SOURCE) break;
      if (typeof data.totalResults === "number" && out.length >= data.totalResults) break;
      if (jobs.length < RESULTS_PER_PAGE) break;

      await sleep(PAGE_DELAY_MS);
    }
  } catch {
    // network/abort — return what we have
  }

  return out.slice(0, MAX_RESULTS_PER_SOURCE);
}

// ─── Himalayas (official public API, no key required; remote-only jobs).
// The API has no server-side keyword search, so we fetch a page window and
// filter client-side by keyword against title/company/categories. ───────────
async function fetchHimalayas(keyword: string): Promise<JobListing[]> {
  const terms = keyword.toLowerCase().split(/\s+/).filter(Boolean);
  // The API silently caps `limit` at 20 regardless of what's requested. Since
  // there's no server-side keyword filter and the match rate against a small
  // sample is low, we scan several pages fetched concurrently (not sequential
  // + delayed like the other sources) to keep overall search latency down.
  const HI_PAGE_SIZE = 20;
  const HI_PAGES = MAX_PAGES_PER_SOURCE * 3;

  type HimalayasPage = {
    jobs?: Array<{
      guid?: string; title?: string; companyName?: string; excerpt?: string;
      categories?: string[]; locationRestrictions?: string[]; pubDate?: number;
      applicationLink?: string; minSalary?: number; maxSalary?: number; currency?: string;
    }>;
  };

  const out: JobListing[] = [];

  try {
    const pages = await Promise.all(
      Array.from({ length: HI_PAGES }, (_, page) =>
        fetch(`https://himalayas.app/jobs/api?limit=${HI_PAGE_SIZE}&offset=${page * HI_PAGE_SIZE}`, {
          signal: AbortSignal.timeout(10000),
        })
          .then((res) => (res.ok ? (res.json() as Promise<HimalayasPage>) : null))
          .catch(() => null)
      )
    );

    for (const [page, data] of pages.entries()) {
      for (const j of data?.jobs ?? []) {
        if (!j.applicationLink || !j.title) continue;
        const haystack = `${j.title} ${j.companyName ?? ""} ${(j.categories ?? []).join(" ")}`.toLowerCase();
        if (terms.length && !terms.some((t) => haystack.includes(t))) continue;

        const salary = j.minSalary && j.maxSalary
          ? `${j.currency ?? "USD"} ${j.minSalary.toLocaleString()} – ${j.maxSalary.toLocaleString()}`
          : null;

        out.push({
          id: `himalayas-${j.guid ?? `${page}-${out.length}`}`,
          title: j.title,
          company: j.companyName ?? "",
          location: (j.locationRestrictions ?? []).join(", ") || "Remote",
          country: null,
          salary,
          source: "Himalayas",
          postedAt: j.pubDate ? new Date(j.pubDate * 1000).toISOString() : null,
          jobUrl: j.applicationLink,
          snippet: j.excerpt || null,
          isRemote: true,
        });
      }
    }
  } catch {
    // return what we have
  }

  return out.slice(0, MAX_RESULTS_PER_SOURCE);
}

// ─── Findwork.dev (official API; requires free API token from findwork.dev) ──
async function fetchFindwork(keyword: string, remoteOnly: boolean, city?: string): Promise<JobListing[]> {
  const apiKey = process.env.FINDWORK_API_KEY;
  if (!apiKey) return [];

  const out: JobListing[] = [];
  const params = new URLSearchParams({ search: keyword });
  if (city) params.set("location", city);
  if (remoteOnly) params.set("remote", "true");
  let url: string | null = `https://findwork.dev/api/jobs/?${params}`;

  try {
    for (let page = 0; page < MAX_PAGES_PER_SOURCE && url; page++) {
      const res = await fetch(url, {
        headers: { Authorization: `Token ${apiKey}` },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) break;

      const data = (await res.json()) as {
        next?: string | null;
        results?: Array<{
          id?: number; role?: string; text?: string; company_name?: string;
          location?: string; remote?: boolean; url?: string; date_posted?: string;
        }>;
      };

      const jobs = data.results ?? [];
      if (jobs.length === 0) break;

      for (const j of jobs) {
        if (!j.url || !j.role) continue;
        out.push({
          id: `findwork-${j.id ?? `${page}-${out.length}`}`,
          title: j.role,
          company: j.company_name ?? "",
          location: j.location || (j.remote ? "Remote" : ""),
          country: null,
          salary: null,
          source: "Findwork",
          postedAt: j.date_posted || null,
          jobUrl: j.url,
          snippet: j.text?.replace(/<[^>]+>/g, "").slice(0, 300) || null,
          isRemote: !!j.remote,
        });
      }

      if (out.length >= MAX_RESULTS_PER_SOURCE) break;
      url = data.next ?? null;

      await sleep(PAGE_DELAY_MS);
    }
  } catch {
    // network/abort/invalid-token — return what we have
  }

  return out.slice(0, MAX_RESULTS_PER_SOURCE);
}

// ─── LinkedIn (public guest jobs API, no key required) ───────────────────────
// Searches LinkedIn's publicly-accessible guest job search endpoint using
// cheerio to parse the HTML job cards it returns.
//
// workTypes:
//   "1" = On-site, "2" = Remote, "3" = Hybrid (comma-separated for multiple)
// LinkedIn's f_TPR is in seconds: maxDaysOld * 86400.
// LinkedIn f_JT job type codes
const LI_JOB_TYPE: Record<string, string> = {
  "full-time":  "F",
  "part-time":  "P",
  "internship": "I",
  "contract":   "C",
};

async function fetchLinkedIn(
  keyword: string,
  location: string,
  workTypes: string,   // e.g. "2,3" for Remote+Hybrid
  maxDaysOld?: number,
  jobType?: string,
): Promise<JobListing[]> {
  const LI_PAGE_SIZE = 25;
  const out: JobListing[] = [];

  const timeSeconds = maxDaysOld !== undefined ? maxDaysOld * 86400 : undefined;

  try {
    for (let start = 0; start < MAX_RESULTS_PER_SOURCE; start += LI_PAGE_SIZE) {
      if (start / LI_PAGE_SIZE >= MAX_PAGES_PER_SOURCE) break;

      const params = new URLSearchParams({ keywords: keyword, location, start: String(start) });
      if (workTypes) params.set("f_WT", workTypes);
      if (timeSeconds) params.set("f_TPR", `r${timeSeconds}`);
      if (jobType && LI_JOB_TYPE[jobType]) params.set("f_JT", LI_JOB_TYPE[jobType]);

      const res = await fetch(
        `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?${params}`,
        {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9",
          },
          signal: AbortSignal.timeout(12000),
        }
      );

      if (!res.ok) break;
      const html = await res.text();
      const $ = cheerio.load(html);
      const cards = $("li");
      if (cards.length === 0) break;

      cards.each((_, el) => {
        const $el = $(el);
        const title = $el.find(".base-search-card__title").text().trim();
        const company = $el.find(".base-search-card__subtitle").text().trim();
        const loc = $el.find(".job-search-card__location").text().trim();
        const dateAttr = $el.find("time[datetime]").attr("datetime") ?? null;
        const rawUrl =
          $el.find("a.base-card__full-link").attr("href") ??
          $el.find("a[href*='/jobs/view/']").attr("href") ?? "";

        if (!title || !rawUrl) return;

        // Strip tracking params from LinkedIn URLs
        const jobUrl = rawUrl.split("?")[0] ?? rawUrl;
        const jobIdMatch = jobUrl.match(/\/jobs\/view\/(\d+)/);
        const id = `linkedin-${jobIdMatch?.[1] ?? `${start}-${out.length}`}`;
        const isRemote = /remote/i.test(loc);

        out.push({
          id,
          title,
          company,
          location: loc || location,
          country: null,
          salary: null,
          source: "LinkedIn",
          postedAt: dateAttr,
          jobUrl,
          snippet: null,
          isRemote,
        });
      });

      if (out.length >= MAX_RESULTS_PER_SOURCE) break;
      if (cards.length < LI_PAGE_SIZE) break;

      await sleep(PAGE_DELAY_MS);
    }
  } catch {
    // network/rate-limit/block — return what we collected
  }

  return out.slice(0, MAX_RESULTS_PER_SOURCE);
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

// ─── Date filter ─────────────────────────────────────────────────────────────
function filterByAge(listings: JobListing[], maxDaysOld: number): JobListing[] {
  const cutoff = Date.now() - maxDaysOld * 24 * 60 * 60 * 1000;
  return listings.filter((j) => {
    if (!j.postedAt) return false;
    const posted = new Date(j.postedAt).getTime();
    return !isNaN(posted) && posted >= cutoff;
  });
}

// ─── Route ───────────────────────────────────────────────────────────────────
router.get("/jobs/search", async (req, res): Promise<void> => {
  const parsed = SearchJobsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { keyword, country = "", remote, hybrid, city, jobType, maxDaysOld } = parsed.data;
  const remoteOnly = remote === "true";
  const hybridOnly = hybrid === "true";

  // LinkedIn work-type filter.
  // When a city is set we want on-site + hybrid + remote (all Warsaw-relevant
  // results) so we only restrict to remote-only when that flag is explicit.
  // Empty string = no filter = all work types.
  const liWorkTypes = city
    ? (remoteOnly ? "2" : "")          // city search: all types unless explicitly remote-only
    : (remoteOnly ? "2" : hybridOnly ? "2,3" : "");

  // LinkedIn location: prefer "City, Country" when both are provided.
  const liLocation = city && country ? `${city}, ${country}` : city ?? country;

  const cacheKey = `${keyword}|${country}|${city ?? ""}|${remoteOnly}|${hybridOnly}|${jobType ?? ""}|${maxDaysOld ?? ""}|${MAX_PAGES_PER_SOURCE}|${MAX_RESULTS_PER_SOURCE}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    res.json(cached.data);
    return;
  }

  // Include remote sources (Remotive, RemoteOK) when: explicitly remote-only,
  // no country specified, OR a city is given (city searches always mix in remote).
  const shouldFetchRemote = remoteOnly || !country || !!city;
  const isTurkey = country.toLowerCase() === "turkey";
  const isUK = ["united kingdom", "uk", "gb", "great britain"].includes(country.toLowerCase());
  const shouldFetchReed = isUK || !country;

  const [jooble, adzuna, iskur, remotive, remoteOK, linkedin, arbeitnow, jobicy, reed, himalayas, findwork] = await Promise.allSettled([
    fetchJooble(keyword, country, remoteOnly, city),
    fetchAdzuna(keyword, country, remoteOnly, maxDaysOld, city, jobType),
    isTurkey ? fetchIskur(keyword, country) : Promise.resolve([]),
    shouldFetchRemote ? fetchRemotive(keyword) : Promise.resolve([]),
    shouldFetchRemote ? fetchRemoteOK(keyword) : Promise.resolve([]),
    liLocation ? fetchLinkedIn(keyword, liLocation, liWorkTypes, maxDaysOld, jobType) : Promise.resolve([]),
    fetchArbeitnow(keyword, remoteOnly, country, city),
    shouldFetchRemote ? fetchJobicy(keyword) : Promise.resolve([]),
    shouldFetchReed ? fetchReed(keyword, remoteOnly, city) : Promise.resolve([]),
    shouldFetchRemote ? fetchHimalayas(keyword) : Promise.resolve([]),
    fetchFindwork(keyword, remoteOnly, city),
  ]);

  const all: JobListing[] = [
    ...(jooble.status === "fulfilled" ? jooble.value : []),
    ...(adzuna.status === "fulfilled" ? adzuna.value : []),
    ...(iskur.status === "fulfilled" ? iskur.value : []),
    ...(remotive.status === "fulfilled" ? remotive.value : []),
    ...(remoteOK.status === "fulfilled" ? remoteOK.value : []),
    ...(linkedin.status === "fulfilled" ? linkedin.value : []),
    ...(arbeitnow.status === "fulfilled" ? arbeitnow.value : []),
    ...(jobicy.status === "fulfilled" ? jobicy.value : []),
    ...(reed.status === "fulfilled" ? reed.value : []),
    ...(himalayas.status === "fulfilled" ? himalayas.value : []),
    ...(findwork.status === "fulfilled" ? findwork.value : []),
  ];

  const deduped = deduplicate(all);
  const results = maxDaysOld !== undefined ? filterByAge(deduped, maxDaysOld) : deduped;

  cache.set(cacheKey, { data: results, expiresAt: Date.now() + CACHE_TTL_MS });

  res.json(results);
});

export default router;
