import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCreateApplication, getListApplicationsQueryKey, getGetDashboardStatsQueryKey, getApiBaseUrl, getToken } from "@workspace/api-client-react";
import {
  Search, Loader2, MapPin, Building2, ExternalLink, BookmarkPlus,
  Check, Wifi, AlertCircle, CalendarDays, GitMerge, Send, Briefcase, Globe,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import type { ApplicationInputStatus } from "@workspace/api-client-react";

const EUROPEAN_COUNTRIES = [
  "Any", "Austria", "Belgium", "Bulgaria", "Croatia", "Czech Republic",
  "Denmark", "Estonia", "Finland", "France", "Germany", "Greece",
  "Hungary", "Ireland", "Italy", "Latvia", "Lithuania", "Luxembourg",
  "Malta", "Netherlands", "Norway", "Poland", "Portugal", "Romania",
  "Slovakia", "Slovenia", "Spain", "Sweden", "Switzerland", "Turkey",
  "Ukraine", "United Kingdom",
];

// Country → Indeed country-subdomain (Indeed has no public search API; these
// are plain deep-links to Indeed's own search page — no scraping, no data
// pulled server-side, just a prefilled URL the user opens themselves).
const INDEED_DOMAINS: Record<string, string> = {
  "united kingdom": "uk", germany: "de", france: "fr", netherlands: "nl",
  poland: "pl", italy: "it", spain: "es", turkey: "tr", austria: "at",
  belgium: "be", switzerland: "ch", ireland: "ie", portugal: "pt",
  sweden: "se", norway: "no", denmark: "dk", finland: "fi",
  "czech republic": "cz", hungary: "hu", romania: "ro", greece: "gr",
};

interface QuickSearchLink {
  name: string;
  url: string;
}

// Builds "search on this site" links for boards with no public API (Indeed,
// Monster, Glassdoor, …) plus a few region-specific boards. These only ever
// open the site's own search page in a new tab — nothing is fetched or
// scraped; the user applies there directly.
function buildQuickSearchLinks(keyword: string, city: string, country: string): QuickSearchLink[] {
  const q = keyword.trim();
  if (!q) return [];

  const loc = [city, country !== "Any" ? country : ""].filter(Boolean).join(", ");
  const encQ = encodeURIComponent(q);
  const encLoc = encodeURIComponent(loc);

  const indeedSub = INDEED_DOMAINS[country.toLowerCase()];
  const indeedHost = indeedSub ? `${indeedSub}.indeed.com` : "www.indeed.com";

  const links: QuickSearchLink[] = [
    { name: "Indeed", url: `https://${indeedHost}/jobs?q=${encQ}${loc ? `&l=${encLoc}` : ""}` },
    { name: "LinkedIn", url: `https://www.linkedin.com/jobs/search/?keywords=${encQ}${loc ? `&location=${encLoc}` : ""}` },
    { name: "Glassdoor", url: `https://www.glassdoor.com/Job/jobs.htm?sc.keyword=${encQ}` },
    { name: "Monster", url: `https://www.monster.com/jobs/search/?q=${encQ}${loc ? `&where=${encLoc}` : ""}` },
    { name: "ZipRecruiter", url: `https://www.ziprecruiter.com/jobs-search?search=${encQ}${loc ? `&location=${encLoc}` : ""}` },
    { name: "SimplyHired", url: `https://www.simplyhired.com/search?q=${encQ}${loc ? `&l=${encLoc}` : ""}` },
    { name: "CareerBuilder", url: `https://www.careerbuilder.com/jobs?keywords=${encQ}${loc ? `&location=${encLoc}` : ""}` },
  ];

  if (country === "United Kingdom") {
    links.push(
      { name: "Totaljobs", url: `https://www.totaljobs.com/jobs/${encodeURIComponent(q.replace(/\s+/g, "-"))}` },
      { name: "CV-Library", url: `https://www.cv-library.co.uk/search-jobs?q=${encQ}${city ? `&geo=${encodeURIComponent(city)}` : ""}` },
    );
  }
  if (country === "Poland") {
    links.push(
      { name: "Pracuj.pl", url: `https://www.pracuj.pl/praca/${encQ};kw` },
      { name: "Just Join IT", url: `https://justjoin.it/job-offers/all-locations` },
      { name: "NoFluffJobs", url: `https://nofluffjobs.com/pl/jobs?criteria=${encQ}` },
      { name: "OLX Praca", url: `https://www.olx.pl/praca/q-${encodeURIComponent(q.replace(/\s+/g, "-"))}/` },
      { name: "eRecruiter", url: `https://www.erecruiter.pl/praca` },
    );
  }
  if (country === "Turkey") {
    links.push(
      { name: "Kariyer.net", url: `https://www.kariyer.net/is-ilanlari?q=${encQ}` },
      { name: "Yenibiris", url: `https://www.yenibiris.com/is-ilanlari?q=${encQ}` },
    );
  }
  if (["Germany", "Austria", "Switzerland"].includes(country)) {
    links.push({
      name: "StepStone",
      url: `https://www.stepstone.de/jobs/${encQ}/in-${encodeURIComponent(city || country)}`,
    });
  }

  return links;
}

const JOB_TYPES = [
  { value: "any",        label: "Any type" },
  { value: "full-time",  label: "Full-time" },
  { value: "part-time",  label: "Part-time" },
  { value: "internship", label: "Internship" },
  { value: "contract",   label: "Contract" },
];

// Words the user might type in the keyword that are actually job-type filters.
// We strip them from the keyword and merge them into the jobType param so
// e.g. "data engineer internship" → keyword="data engineer" + jobType="internship".
const JOB_TYPE_ALIASES: Record<string, string> = {
  internship: "internship",
  intern:     "internship",
  "full-time": "full-time",
  fulltime:    "full-time",
  "full time": "full-time",
  "part-time": "part-time",
  parttime:    "part-time",
  "part time": "part-time",
  contract:    "contract",
  freelance:   "contract",
};

function parseKeyword(raw: string): { cleanKeyword: string; inferredJobType: string | null } {
  let kw = raw.trim();
  let inferredJobType: string | null = null;
  for (const [alias, type] of Object.entries(JOB_TYPE_ALIASES)) {
    const escaped = alias.replace(/[-]/g, "\\-");
    const regex = new RegExp(`(?:^|\\s)${escaped}(?:\\s|$)`, "i");
    if (regex.test(kw)) {
      kw = kw.replace(regex, " ").replace(/\s+/g, " ").trim();
      inferredJobType = type;
      break;
    }
  }
  return { cleanKeyword: kw || raw.trim(), inferredJobType };
}

const SOURCE_COLORS: Record<string, string> = {
  Jooble:    "bg-blue-100 text-blue-700 border-blue-200",
  Adzuna:    "bg-violet-100 text-violet-700 border-violet-200",
  Remotive:  "bg-emerald-100 text-emerald-700 border-emerald-200",
  RemoteOK:  "bg-orange-100 text-orange-700 border-orange-200",
  ISKUR:     "bg-rose-100 text-rose-700 border-rose-200",
  LinkedIn:  "bg-sky-100 text-sky-700 border-sky-200",
  Arbeitnow: "bg-amber-100 text-amber-700 border-amber-200",
  Jobicy:    "bg-teal-100 text-teal-700 border-teal-200",
  Reed:      "bg-red-100 text-red-700 border-red-200",
};

interface JobListing {
  id: string;
  title: string;
  company: string;
  location: string;
  country: string | null;
  salary: string | null;
  source: "Jooble" | "Adzuna" | "Remotive" | "RemoteOK" | "ISKUR" | "LinkedIn" | "Arbeitnow" | "Jobicy" | "Reed";
  postedAt: string | null;
  jobUrl: string;
  snippet: string | null;
  isRemote: boolean;
}

export default function JobSearch() {
  const [keyword, setKeyword] = useState("");
  const [country, setCountry] = useState("Poland");
  const [city, setCity] = useState("Warsaw");
  const [jobType, setJobType] = useState("any");
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [hybridOnly, setHybridOnly] = useState(true);
  const [thisWeekOnly, setThisWeekOnly] = useState(false);
  const [results, setResults] = useState<JobListing[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());
  const [isSavingAll, setIsSavingAll] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createApp = useCreateApplication();

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: getListApplicationsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() });
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!keyword.trim()) return;
    setIsSearching(true);
    setSearchError(null);
    setResults(null);
    setSavedIds(new Set());
    setAppliedIds(new Set());

    try {
      const { cleanKeyword, inferredJobType } = parseKeyword(keyword);
      // jobType dropdown wins; fall back to inferred type from keyword text
      const effectiveJobType = jobType !== "any" ? jobType : inferredJobType;

      const params = new URLSearchParams({ keyword: cleanKeyword });
      if (country && country !== "Any") params.set("country", country);
      if (city.trim()) params.set("city", city.trim());
      if (remoteOnly) params.set("remote", "true");
      if (hybridOnly) params.set("hybrid", "true");
      if (effectiveJobType) params.set("jobType", effectiveJobType);
      if (thisWeekOnly) params.set("maxDaysOld", "7");

      const token = getToken();
      const res = await fetch(`${getApiBaseUrl()}/api/jobs/search?${params}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Search failed" }));
        throw new Error(err.error ?? "Search failed");
      }
      setResults(await res.json());
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setIsSearching(false);
    }
  }

  function resolvedCountry() {
    return country !== "Any" ? country : (city.trim() || undefined);
  }

  async function applyOne(job: JobListing, status: "Saved" | "Applied"): Promise<boolean> {
    try {
      await createApp.mutateAsync({
        data: {
          companyName: job.company,
          roleTitle: job.title,
          country: job.country ?? resolvedCountry(),
          jobPostingUrl: job.jobUrl,
          status: status as ApplicationInputStatus,
          source: job.source,
          ...(status === "Applied" ? { dateApplied: new Date().toISOString().split("T")[0] } : {}),
        },
      });
      setSavedIds((prev) => new Set([...prev, job.id]));
      if (status === "Applied") setAppliedIds((prev) => new Set([...prev, job.id]));
      return true;
    } catch {
      return false;
    }
  }

  async function handleQuickApply(job: JobListing) {
    // Open the posting immediately — don't wait for the DB call.
    window.open(job.jobUrl, "_blank", "noopener,noreferrer");
    const ok = await applyOne(job, "Applied");
    invalidate();
    toast({
      title: ok ? `Applied: ${job.title} at ${job.company}` : "Applied (but couldn't save to tracker)",
      variant: ok ? "default" : "destructive",
    });
  }

  async function handleSave(job: JobListing) {
    const ok = await applyOne(job, "Saved");
    invalidate();
    if (ok) toast({ title: `Saved: ${job.title} at ${job.company}` });
    else toast({ title: "Failed to save", variant: "destructive" });
  }

  async function handleSaveAll() {
    if (!results) return;
    const pending = results.filter((j) => !savedIds.has(j.id));
    if (!pending.length) return;
    setIsSavingAll(true);
    let saved = 0;
    for (const job of pending) { if (await applyOne(job, "Saved")) saved++; }
    invalidate();
    setIsSavingAll(false);
    toast({
      title: `Saved ${saved} of ${pending.length}`,
      variant: saved === pending.length ? "default" : "destructive",
    });
  }

  function formatDate(dateStr: string | null) {
    if (!dateStr) return null;
    try {
      return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    } catch { return null; }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-border px-6 py-4 bg-background">
        <h1 className="text-xl font-semibold text-foreground">Find Jobs</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Set your criteria and hit Search — Quick Apply opens the posting and logs it as Applied in one click
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Search Form */}
        <form onSubmit={handleSearch} className="bg-card border border-border rounded-lg p-4 space-y-3">

          {/* Row 1: keyword + location */}
          <div className="flex flex-col md:flex-row gap-3">
            <div className="flex-1">
              <Input
                placeholder="Job title or skill — e.g. 'Software Engineer', 'Data Analyst'"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                data-testid="input-keyword"
              />
            </div>
            <div className="w-full md:w-32">
              <Input
                placeholder="City"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                data-testid="input-city"
              />
            </div>
            <div className="w-full md:w-36">
              <Select value={country} onValueChange={setCountry}>
                <SelectTrigger data-testid="select-country">
                  <SelectValue placeholder="Country" />
                </SelectTrigger>
                <SelectContent>
                  {EUROPEAN_COUNTRIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-full md:w-36">
              <Select value={jobType} onValueChange={setJobType}>
                <SelectTrigger data-testid="select-job-type">
                  <SelectValue placeholder="Job type" />
                </SelectTrigger>
                <SelectContent>
                  {JOB_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={isSearching || !keyword.trim()} className="shrink-0" data-testid="button-search">
              {isSearching
                ? <><Loader2 size={14} className="mr-2 animate-spin" /> Searching…</>
                : <><Search size={14} className="mr-2" /> Search</>
              }
            </Button>
          </div>

          {/* Row 2: toggles */}
          <div className="flex items-center gap-5 flex-wrap">
            {[
              { id: "hybrid",    state: hybridOnly,   set: setHybridOnly,   icon: <GitMerge size={13} />,    label: "Hybrid (LinkedIn)" },
              { id: "remote",    state: remoteOnly,   set: setRemoteOnly,   icon: <Wifi size={13} />,        label: "Remote only" },
              { id: "this-week", state: thisWeekOnly, set: setThisWeekOnly, icon: <CalendarDays size={13} />, label: "Posted this week" },
            ].map(({ id, state, set, icon, label }) => (
              <label key={id} htmlFor={id} className="flex items-center gap-1.5 text-sm text-muted-foreground cursor-pointer select-none">
                <input
                  type="checkbox" id={id} checked={state}
                  onChange={(e) => set(e.target.checked)}
                  className="rounded" data-testid={`checkbox-${id}`}
                />
                {icon}{label}
              </label>
            ))}
          </div>
        </form>

        {/* Master search — direct links to boards with no public API (Indeed,
            Monster, Glassdoor, …). Opens their own search page in a new tab;
            nothing is fetched here — you apply on that site. */}
        {keyword.trim() && (
          <div className="bg-card border border-border rounded-lg p-4">
            <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
              <Globe size={13} />
              Also search directly on
            </p>
            <div className="flex flex-wrap gap-2">
              {buildQuickSearchLinks(keyword, city, country).map((link) => (
                <a
                  key={link.name}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-border bg-muted/50 hover:bg-muted text-foreground transition-colors"
                  data-testid={`quicklink-${link.name.toLowerCase().replace(/[^a-z0-9]/g, "")}`}
                >
                  {link.name}
                  <ExternalLink size={11} />
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Error */}
        {searchError && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 flex items-start gap-2" data-testid="search-error">
            <AlertCircle size={16} className="text-destructive mt-0.5 shrink-0" />
            <p className="text-sm text-destructive">{searchError}</p>
          </div>
        )}

        {/* Loading skeleton */}
        {isSearching && (
          <div className="space-y-3" data-testid="search-loading">
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Loader2 size={12} className="animate-spin" />
              Searching Jooble, Adzuna, LinkedIn, Remotive, RemoteOK, Arbeitnow, Jobicy…
            </p>
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="bg-card border border-border rounded-lg p-4 animate-pulse">
                <div className="flex justify-between gap-4">
                  <div className="space-y-2 flex-1">
                    <div className="h-4 bg-muted rounded w-2/3" />
                    <div className="h-3 bg-muted rounded w-1/3" />
                    <div className="h-3 bg-muted rounded w-1/2" />
                  </div>
                  <div className="h-16 bg-muted rounded w-24 shrink-0" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Results */}
        {results !== null && !isSearching && (
          <>
            {/* Results header */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-sm font-medium text-foreground" data-testid="results-count">
                {results.length} result{results.length !== 1 ? "s" : ""} found
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                {(["Jooble", "Adzuna", "LinkedIn", "Remotive", "RemoteOK", "ISKUR", "Arbeitnow", "Jobicy", "Reed"] as const).map((src) => {
                  const count = results.filter((r) => r.source === src).length;
                  if (!count) return null;
                  return (
                    <span key={src} className={`text-xs px-2 py-0.5 rounded-full border font-medium ${SOURCE_COLORS[src]}`}>
                      {src}: {count}
                    </span>
                  );
                })}
                {results.length > 0 && (() => {
                  const unsaved = results.filter((r) => !savedIds.has(r.id)).length;
                  return (
                    <Button size="sm" variant="outline" className="text-xs h-7"
                      onClick={handleSaveAll} disabled={isSavingAll || unsaved === 0}
                      data-testid="button-save-all">
                      {isSavingAll
                        ? <><Loader2 size={11} className="mr-1 animate-spin" /> Saving…</>
                        : unsaved === 0
                        ? <><Check size={11} className="mr-1" /> All saved</>
                        : <><BookmarkPlus size={11} className="mr-1" /> Save all ({unsaved})</>
                      }
                    </Button>
                  );
                })()}
              </div>
            </div>

            {results.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground" data-testid="no-results">
                <Briefcase size={36} className="mx-auto mb-3 opacity-20" />
                <p className="font-medium">No results found</p>
                <p className="text-xs mt-1">Try a broader keyword, different job type, or uncheck "Posted this week".</p>
              </div>
            ) : (
              <div className="space-y-2">
                {results.map((job) => {
                  const saved    = savedIds.has(job.id);
                  const applied  = appliedIds.has(job.id);
                  const color    = SOURCE_COLORS[job.source] ?? "bg-gray-100 text-gray-600 border-gray-200";
                  const postedDate = formatDate(job.postedAt);
                  const busy     = createApp.isPending || isSavingAll;

                  return (
                    <div key={job.id}
                      className="bg-card border border-border rounded-lg p-4 hover:shadow-sm transition-shadow"
                      data-testid={`job-listing-${job.id}`}>
                      <div className="flex items-start justify-between gap-4">

                        {/* Left: job info */}
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-start gap-2 flex-wrap">
                            <h3 className="font-semibold text-sm text-foreground leading-tight">{job.title}</h3>
                            {job.isRemote && (
                              <span className="text-xs bg-teal-100 text-teal-700 border border-teal-200 rounded-full px-1.5 py-0.5 font-medium shrink-0">
                                Remote
                              </span>
                            )}
                            {applied && (
                              <span className="text-xs bg-green-100 text-green-700 border border-green-200 rounded-full px-1.5 py-0.5 font-medium shrink-0">
                                Applied ✓
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                            <span className="flex items-center gap-1"><Building2 size={11} />{job.company}</span>
                            <span className="flex items-center gap-1"><MapPin size={11} />{job.location}</span>
                            {job.salary && <span className="text-green-700 font-medium">{job.salary}</span>}
                            {postedDate && <span>{postedDate}</span>}
                          </div>
                          {job.snippet && (
                            <p className="text-xs text-muted-foreground line-clamp-2">{job.snippet}</p>
                          )}
                          <span className={`inline-flex items-center border text-xs px-1.5 py-0.5 rounded font-medium ${color}`}>
                            {job.source}
                          </span>
                        </div>

                        {/* Right: actions */}
                        <div className="flex flex-col gap-1.5 shrink-0 w-28">
                          {/* Primary CTA */}
                          <Button size="sm"
                            className="text-xs h-8 w-full"
                            onClick={() => !applied && handleQuickApply(job)}
                            disabled={applied || busy}
                            data-testid={`button-apply-${job.id}`}>
                            {applied
                              ? <><Check size={12} className="mr-1" /> Applied</>
                              : <><Send size={12} className="mr-1" /> Quick Apply</>
                            }
                          </Button>

                          {/* Secondary: view + save */}
                          <div className="flex gap-1">
                            <a href={job.jobUrl} target="_blank" rel="noopener noreferrer" className="flex-1">
                              <Button variant="outline" size="sm" className="text-xs h-7 w-full"
                                data-testid={`button-view-${job.id}`}>
                                <ExternalLink size={11} />
                              </Button>
                            </a>
                            <Button size="sm"
                              variant={saved || applied ? "outline" : "secondary"}
                              className="text-xs h-7 flex-1"
                              onClick={() => !saved && !applied && handleSave(job)}
                              disabled={saved || applied || busy}
                              data-testid={`button-save-${job.id}`}>
                              {saved || applied ? <Check size={11} /> : <BookmarkPlus size={11} />}
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* Empty state */}
        {results === null && !isSearching && (
          <div className="text-center py-16 text-muted-foreground" data-testid="search-empty-state">
            <Search size={40} className="mx-auto mb-4 opacity-20" />
            <p className="font-medium">Set your criteria and search</p>
            <p className="text-xs mt-1">Hits Jooble, Adzuna, LinkedIn, Remotive, RemoteOK, Arbeitnow, and Jobicy in parallel.</p>
            <p className="text-xs mt-0.5 text-muted-foreground/70">Quick Apply opens the posting and logs it as Applied in one click.</p>
          </div>
        )}
      </div>
    </div>
  );
}
