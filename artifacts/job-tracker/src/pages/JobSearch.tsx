import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCreateApplication, getListApplicationsQueryKey, getGetDashboardStatsQueryKey, getApiBaseUrl, getToken } from "@workspace/api-client-react";
import {
  Search, Loader2, MapPin, Building2, ExternalLink, BookmarkPlus,
  Check, Wifi, AlertCircle, CalendarDays, GitMerge, Send, Briefcase, Globe,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import type { ApplicationInputStatus } from "@workspace/api-client-react";
import { isSafeUrl } from "@/lib/url";

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
// open the site's own search page in a new tab; nothing is fetched or
// scraped — the user applies there directly.
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

type Tier = "great" | "good" | "long";

function tierOf(score: number): Tier {
  if (score >= 50) return "great";
  if (score >= 25) return "good";
  return "long";
}

const TIER_CONFIG: Record<Tier, { label: string; blurb: string; dot: string; ring: string; ringText: string }> = {
  great: { label: "Great matches", blurb: "— strong overlap with your skills", dot: "bg-sage", ring: "border-sage bg-sage-tint", ringText: "text-sage" },
  good:  { label: "Worth a look",   blurb: "— partial fit, could still be right", dot: "bg-ochre", ring: "border-ochre bg-ochre-tint", ringText: "text-ochre" },
  long:  { label: "Long shots",     blurb: "— low overlap, browse if curious", dot: "bg-muted-foreground", ring: "border-muted-foreground bg-chip", ringText: "text-muted-foreground" },
};

interface JobListing {
  id: string;
  title: string;
  company: string;
  location: string;
  country: string | null;
  salary: string | null;
  source: "Jooble" | "Adzuna" | "Remotive" | "RemoteOK" | "ISKUR" | "LinkedIn" | "Arbeitnow" | "Jobicy" | "Reed" | "Himalayas" | "Findwork" | "JustJoinIT";
  postedAt: string | null;
  jobUrl: string;
  snippet: string | null;
  isRemote: boolean;
  matchScore: number;
  matchedSkills: string[];
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-[13px] font-semibold px-3.5 py-1.5 rounded-full border transition-colors ${
        active
          ? "bg-ember-tint border-ember-tint-border text-ember"
          : "bg-card border-border text-muted-foreground hover:border-ember-tint-border"
      }`}
    >
      {children}
    </button>
  );
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
    if (isSafeUrl(job.jobUrl)) window.open(job.jobUrl, "_blank", "noopener,noreferrer");
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

  const quickLinks = buildQuickSearchLinks(keyword, city, country);

  // Group results into match tiers — purely presentational, using the
  // matchScore/matchedSkills already returned by the search API. Skipped
  // entirely when every result is 0 (no profile skills set), since tiering
  // an all-zero score would be meaningless.
  const hasMatchData = !!results?.some((r) => r.matchScore > 0);
  const tiers: { tier: Tier; jobs: JobListing[] }[] = hasMatchData
    ? (["great", "good", "long"] as Tier[])
        .map((tier) => ({ tier, jobs: (results ?? []).filter((j) => tierOf(j.matchScore) === tier) }))
        .filter((g) => g.jobs.length > 0)
    : [];

  const sourceSummary = (() => {
    if (!results || results.length === 0) return null;
    const counts = new Map<string, number>();
    for (const r of results) counts.set(r.source, (counts.get(r.source) ?? 0) + 1);
    const sources = [...counts.keys()];
    if (sources.length <= 3) return sources.join(", ");
    return `${sources.slice(0, 2).join(", ")} and ${sources.length - 2} more`;
  })();

  function renderJobCard(job: JobListing) {
    const saved = savedIds.has(job.id);
    const applied = appliedIds.has(job.id);
    const postedDate = formatDate(job.postedAt);
    const busy = createApp.isPending || isSavingAll;
    const tier = TIER_CONFIG[tierOf(job.matchScore)];

    return (
      <div
        key={job.id}
        className="bg-card border border-border rounded-[14px] p-4 md:p-[18px] shadow-card hover:border-ember-tint-border transition-colors"
        data-testid={`job-listing-${job.id}`}
      >
        <div className="flex items-start gap-4">
          {/* Match ring */}
          {hasMatchData && (
            <div className="flex flex-col items-center gap-0.5 shrink-0 w-[52px]">
              <span
                className={`flex items-center justify-center w-[46px] h-[46px] rounded-full border-[2.5px] text-[13px] font-bold ${tier.ring} ${tier.ringText}`}
              >
                {job.matchScore}%
              </span>
              <span className="text-[10.5px] font-semibold text-muted-foreground uppercase tracking-[0.05em]">match</span>
            </div>
          )}

          {/* Middle: job info */}
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-start gap-2 flex-wrap">
              <h3 className="font-bold text-[15.5px] text-foreground leading-tight">{job.title}</h3>
              {job.isRemote && (
                <span className="text-[11.5px] font-semibold text-sage bg-sage-tint rounded-full px-2.5 py-0.5 shrink-0">
                  Remote
                </span>
              )}
              <span className="text-[11.5px] font-semibold text-muted-foreground bg-chip rounded-full px-2.5 py-0.5 shrink-0">
                {job.source}
              </span>
              {applied && (
                <span className="text-[11.5px] font-semibold text-sage bg-sage-tint rounded-full px-2.5 py-0.5 shrink-0">
                  Applied ✓
                </span>
              )}
            </div>
            <p className="text-[13.5px] text-muted-foreground flex items-center gap-1 flex-wrap">
              <Building2 size={11} className="inline" /> {job.company} · <MapPin size={11} className="inline" /> {job.location}
              {postedDate && <> · {postedDate}</>}
              {job.salary && <span className="text-sage font-bold"> · {job.salary}</span>}
            </p>
            {job.snippet && (
              <p className="text-[13px] text-muted-foreground line-clamp-2 leading-relaxed">{job.snippet}</p>
            )}
            {job.matchedSkills.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                <span className="text-[11.5px] font-semibold text-muted-foreground">Matches you:</span>
                {job.matchedSkills.slice(0, 6).map((sk) => (
                  <span key={sk} className="text-[11.5px] font-semibold text-sage bg-sage-tint rounded-full px-2.5 py-0.5">
                    {sk}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Right: actions */}
          <div className="flex flex-col gap-1.5 shrink-0 w-[110px] md:w-[126px]">
            <Button
              size="sm"
              className="text-xs h-9 w-full rounded-[10px] font-bold"
              onClick={() => !applied && handleQuickApply(job)}
              disabled={applied || busy}
              data-testid={`button-apply-${job.id}`}
            >
              {applied
                ? <><Check size={12} className="mr-1" /> Applied</>
                : <><Send size={12} className="mr-1" /> Quick apply</>
              }
            </Button>
            <div className="flex gap-1">
              {isSafeUrl(job.jobUrl) && (
                <a href={job.jobUrl} target="_blank" rel="noopener noreferrer" className="flex-1">
                  <Button variant="outline" size="sm" className="text-xs h-8 w-full rounded-[10px]" data-testid={`button-view-${job.id}`}>
                    <ExternalLink size={11} />
                  </Button>
                </a>
              )}
              <Button
                size="sm"
                variant="outline"
                className="text-xs h-8 flex-1 rounded-[10px] hover:border-ember hover:text-ember"
                onClick={() => !saved && !applied && handleSave(job)}
                disabled={saved || applied || busy}
                data-testid={`button-save-${job.id}`}
              >
                {saved || applied ? <Check size={11} /> : <BookmarkPlus size={11} />}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full animate-rise">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[900px] mx-auto px-8 py-7">
          <h1 className="font-display text-[28px] font-bold tracking-tight text-foreground">Find your next role</h1>
          <p className="text-[15px] text-muted-foreground mt-1.5 mb-5">
            Ten job boards, one search — sorted by how well each role fits your profile.
          </p>

          {/* Search Form */}
          <form onSubmit={handleSearch} className="bg-card border border-border rounded-2xl p-4 shadow-card mb-3.5">
            <div className="flex flex-col md:flex-row gap-2.5">
              <div className="flex-1 flex items-center gap-2.5 h-[46px] px-3.5 border border-border rounded-xl bg-background">
                <Search size={16} className="text-muted-foreground shrink-0" />
                <input
                  className="flex-1 bg-transparent outline-none text-[15px] text-foreground placeholder:text-muted-foreground min-w-0"
                  placeholder="Job title or skill — e.g. 'Software Engineer', 'Data Analyst'"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  data-testid="input-keyword"
                />
              </div>
              <div className="w-full md:w-[150px] flex items-center gap-2 h-[46px] px-3.5 border border-border rounded-xl bg-background">
                <MapPin size={14} className="text-muted-foreground shrink-0" />
                <input
                  className="flex-1 bg-transparent outline-none text-[14.5px] text-foreground placeholder:text-muted-foreground min-w-0"
                  placeholder="City"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  data-testid="input-city"
                />
              </div>
              <div className="w-full md:w-[160px]">
                <Select value={country} onValueChange={setCountry}>
                  <SelectTrigger data-testid="select-country" className="h-[46px] rounded-xl bg-background">
                    <SelectValue placeholder="Country" />
                  </SelectTrigger>
                  <SelectContent>
                    {EUROPEAN_COUNTRIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="submit"
                disabled={isSearching || !keyword.trim()}
                className="shrink-0 h-[46px] rounded-xl px-6 font-bold"
                data-testid="button-search"
              >
                {isSearching
                  ? <><Loader2 size={14} className="mr-2 animate-spin" /> Searching…</>
                  : "Search"
                }
              </Button>
            </div>

            {/* Filter chips */}
            <div className="flex items-center gap-2 flex-wrap mt-3">
              {JOB_TYPES.filter((t) => t.value !== "any").map((t) => (
                <Chip key={t.value} active={jobType === t.value} onClick={() => setJobType(jobType === t.value ? "any" : t.value)}>
                  {t.label}
                </Chip>
              ))}
              <Chip active={hybridOnly} onClick={() => setHybridOnly((v) => !v)}>
                <span className="inline-flex items-center gap-1.5"><GitMerge size={12} /> Hybrid</span>
              </Chip>
              <Chip active={remoteOnly} onClick={() => setRemoteOnly((v) => !v)}>
                <span className="inline-flex items-center gap-1.5"><Wifi size={12} /> Remote only</span>
              </Chip>
              <Chip active={thisWeekOnly} onClick={() => setThisWeekOnly((v) => !v)}>
                <span className="inline-flex items-center gap-1.5"><CalendarDays size={12} /> Posted this week</span>
              </Chip>
            </div>
          </form>

          {/* Error */}
          {searchError && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-2xl p-4 flex items-start gap-2 mb-3.5" data-testid="search-error">
              <AlertCircle size={16} className="text-destructive mt-0.5 shrink-0" />
              <p className="text-sm text-destructive">{searchError}</p>
            </div>
          )}

          {/* Loading skeleton */}
          {isSearching && (
            <div className="space-y-3" data-testid="search-loading">
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Loader2 size={12} className="animate-spin" />
                Searching Jooble, Adzuna, LinkedIn, Remotive, RemoteOK, Arbeitnow, Jobicy, Reed, Himalayas, Findwork, Just Join IT…
              </p>
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="bg-card border border-border rounded-2xl p-4 animate-pulse">
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
              <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
                <p className="text-[13.5px] text-muted-foreground" data-testid="results-count">
                  <strong className="text-foreground font-bold">{results.length} role{results.length !== 1 ? "s" : ""}</strong>
                  {sourceSummary && <> across {sourceSummary}</>}
                </p>
                <div className="flex gap-2">
                  {results.length > 0 && (() => {
                    const unsaved = results.filter((r) => !savedIds.has(r.id)).length;
                    return (
                      <Button size="sm" variant="outline" className="text-xs h-8 rounded-[9px]"
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
                  {quickLinks.length > 0 && (
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button size="sm" variant="outline" className="text-xs h-8 rounded-[9px]">
                          <Globe size={12} className="mr-1.5" /> Search on other boards
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-72" align="end">
                        <p className="text-xs font-semibold text-muted-foreground mb-2">Also search directly on</p>
                        <div className="flex flex-wrap gap-1.5">
                          {quickLinks.map((link) => (
                            <a
                              key={link.name}
                              href={link.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full border border-border bg-chip hover:bg-ember-tint hover:text-ember hover:border-ember-tint-border text-foreground transition-colors"
                              data-testid={`quicklink-${link.name.toLowerCase().replace(/[^a-z0-9]/g, "")}`}
                            >
                              {link.name}
                              <ExternalLink size={11} />
                            </a>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                  )}
                </div>
              </div>

              {results.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground" data-testid="no-results">
                  <Briefcase size={36} className="mx-auto mb-3 opacity-20" />
                  <p className="font-medium">No results found</p>
                  <p className="text-xs mt-1">Try a broader keyword, different job type, or uncheck "Posted this week".</p>
                </div>
              ) : hasMatchData ? (
                <div className="space-y-6">
                  {tiers.map(({ tier, jobs }) => {
                    const cfg = TIER_CONFIG[tier];
                    return (
                      <div key={tier}>
                        <div className="flex items-center gap-2 mb-2.5 flex-wrap">
                          <span className={`w-[9px] h-[9px] rounded-full ${cfg.dot}`} />
                          <h2 className="font-display text-base font-bold text-foreground">{cfg.label}</h2>
                          <span className="text-xs font-semibold text-muted-foreground">({jobs.length})</span>
                          <span className="text-xs text-muted-foreground">{cfg.blurb}</span>
                        </div>
                        <div className="flex flex-col gap-2.5">
                          {jobs.map(renderJobCard)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {results.map(renderJobCard)}
                </div>
              )}
            </>
          )}

          {/* Empty state */}
          {results === null && !isSearching && (
            <div className="text-center py-16 text-muted-foreground" data-testid="search-empty-state">
              <Search size={40} className="mx-auto mb-4 opacity-20" />
              <p className="font-medium text-foreground">Set your criteria and search</p>
              <p className="text-xs mt-1">Hits Jooble, Adzuna, LinkedIn, Remotive, RemoteOK, Arbeitnow, Jobicy, Reed, Himalayas, Findwork, and Just Join IT in parallel.</p>
              <p className="text-xs mt-0.5 text-muted-foreground/70">Quick Apply opens the posting and logs it as Applied in one click.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
