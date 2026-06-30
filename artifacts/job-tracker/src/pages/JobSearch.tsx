import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCreateApplication, getListApplicationsQueryKey, getGetDashboardStatsQueryKey } from "@workspace/api-client-react";
import { Search, Loader2, MapPin, Building2, ExternalLink, BookmarkPlus, Check, Wifi, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import type { ApplicationInputStatus } from "@workspace/api-client-react";

const EUROPEAN_COUNTRIES = [
  "Any",
  "Austria",
  "Belgium",
  "Bulgaria",
  "Croatia",
  "Czech Republic",
  "Denmark",
  "Estonia",
  "Finland",
  "France",
  "Germany",
  "Greece",
  "Hungary",
  "Ireland",
  "Italy",
  "Latvia",
  "Lithuania",
  "Luxembourg",
  "Malta",
  "Netherlands",
  "Norway",
  "Poland",
  "Portugal",
  "Romania",
  "Slovakia",
  "Slovenia",
  "Spain",
  "Sweden",
  "Switzerland",
  "Turkey",
  "Ukraine",
  "United Kingdom",
];

const SOURCE_COLORS: Record<string, string> = {
  Jooble: "bg-blue-100 text-blue-700 border-blue-200",
  Adzuna: "bg-violet-100 text-violet-700 border-violet-200",
  Remotive: "bg-emerald-100 text-emerald-700 border-emerald-200",
  RemoteOK: "bg-orange-100 text-orange-700 border-orange-200",
  ISKUR: "bg-rose-100 text-rose-700 border-rose-200",
};

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

export default function JobSearch() {
  const [keyword, setKeyword] = useState("");
  const [country, setCountry] = useState("Any");
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [results, setResults] = useState<JobListing[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [isSavingAll, setIsSavingAll] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createApp = useCreateApplication();

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!keyword.trim()) return;

    setIsSearching(true);
    setSearchError(null);
    setResults(null);

    try {
      const params = new URLSearchParams({ keyword: keyword.trim() });
      if (country && country !== "Any") params.set("country", country);
      if (remoteOnly) params.set("remote", "true");

      const res = await fetch(`/api/jobs/search?${params}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Search failed" }));
        throw new Error(err.error ?? "Search failed");
      }
      const data = await res.json();
      setResults(data);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setIsSearching(false);
    }
  }

  async function saveOne(job: JobListing): Promise<boolean> {
    try {
      await createApp.mutateAsync({
        data: {
          companyName: job.company,
          roleTitle: job.title,
          country: job.country ?? (country !== "Any" ? country : undefined),
          jobPostingUrl: job.jobUrl,
          status: "Saved" as ApplicationInputStatus,
          source: job.source,
        },
      });
      setSavedIds((prev) => new Set([...prev, job.id]));
      return true;
    } catch {
      return false;
    }
  }

  async function handleSave(job: JobListing) {
    const ok = await saveOne(job);
    if (ok) {
      queryClient.invalidateQueries({ queryKey: getListApplicationsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() });
      toast({ title: `Saved: ${job.title} at ${job.company}` });
    } else {
      toast({ title: "Failed to save application", variant: "destructive" });
    }
  }

  async function handleSaveAll() {
    if (!results) return;
    const pending = results.filter((j) => !savedIds.has(j.id));
    if (pending.length === 0) return;

    setIsSavingAll(true);
    let saved = 0;
    // Sequential to stay gentle on the DB and keep saved-state updates ordered.
    for (const job of pending) {
      const ok = await saveOne(job);
      if (ok) saved++;
    }
    queryClient.invalidateQueries({ queryKey: getListApplicationsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() });
    setIsSavingAll(false);
    toast({
      title: `Saved ${saved} of ${pending.length} listing${pending.length !== 1 ? "s" : ""}`,
      variant: saved === pending.length ? "default" : "destructive",
    });
  }

  function formatDate(dateStr: string | null) {
    if (!dateStr) return null;
    try {
      return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    } catch {
      return null;
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-border px-6 py-4 bg-background">
        <h1 className="text-xl font-semibold text-foreground">Find Jobs</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Searches every matching listing across Jooble, Adzuna, Remotive, and RemoteOK — not just the first page
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Search Form */}
        <form onSubmit={handleSearch} className="bg-card border border-border rounded-lg p-4 space-y-3">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="flex-1">
              <Input
                placeholder="Job title, keyword, or skill (e.g. 'Product Manager')"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                data-testid="input-keyword"
                className="w-full"
              />
            </div>
            <div className="w-full md:w-48">
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
            <Button type="submit" disabled={isSearching || !keyword.trim()} className="shrink-0" data-testid="button-search">
              {isSearching ? (
                <><Loader2 size={14} className="mr-2 animate-spin" /> Searching...</>
              ) : (
                <><Search size={14} className="mr-2" /> Search</>
              )}
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="remote-toggle"
              checked={remoteOnly}
              onChange={(e) => setRemoteOnly(e.target.checked)}
              className="rounded"
              data-testid="checkbox-remote"
            />
            <label htmlFor="remote-toggle" className="text-sm text-muted-foreground flex items-center gap-1 cursor-pointer">
              <Wifi size={13} />
              Remote only
            </label>
          </div>
          <p className="text-xs text-muted-foreground">
            Searches pull every matching page, not just the first. Adzuna does not cover Turkey — Jooble is the primary source for Turkish listings (İŞKUR government data will be added if an official API becomes available). Remotive and RemoteOK are remote-first sources included when searching remote or without a specific country.
          </p>
        </form>

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
              Fetching all matching listings across sources — this can take a little longer than a single-page search.
            </p>
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="bg-card border border-border rounded-lg p-4 animate-pulse">
                <div className="flex justify-between gap-4">
                  <div className="space-y-2 flex-1">
                    <div className="h-4 bg-muted rounded w-2/3" />
                    <div className="h-3 bg-muted rounded w-1/3" />
                    <div className="h-3 bg-muted rounded w-1/2" />
                  </div>
                  <div className="h-8 bg-muted rounded w-24 shrink-0" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Results */}
        {results !== null && !isSearching && (
          <>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-sm font-medium text-foreground" data-testid="results-count">
                {results.length} result{results.length !== 1 ? "s" : ""} found
              </p>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {(["Jooble", "Adzuna", "Remotive", "RemoteOK", "ISKUR"] as const).map((src) => {
                    const count = results.filter((r) => r.source === src).length;
                    if (!count) return null;
                    return (
                      <span key={src} className={`text-xs px-2 py-0.5 rounded-full border font-medium ${SOURCE_COLORS[src]}`}>
                        {src}: {count}
                      </span>
                    );
                  })}
                </div>
                {results.length > 0 && (
                  (() => {
                    const unsaved = results.filter((r) => !savedIds.has(r.id)).length;
                    return (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs h-7"
                        onClick={handleSaveAll}
                        disabled={isSavingAll || unsaved === 0}
                        data-testid="button-save-all"
                      >
                        {isSavingAll ? (
                          <><Loader2 size={11} className="mr-1 animate-spin" /> Saving…</>
                        ) : unsaved === 0 ? (
                          <><Check size={11} className="mr-1" /> All saved</>
                        ) : (
                          <><BookmarkPlus size={11} className="mr-1" /> Save all ({unsaved})</>
                        )}
                      </Button>
                    );
                  })()
                )}
              </div>
            </div>

            {results.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground" data-testid="no-results">
                <p>No results found. Try different keywords or a broader country selection.</p>
                <p className="text-xs mt-2">Make sure your API keys are configured in Secrets (JOOBLE_API_KEY, ADZUNA_APP_ID, ADZUNA_APP_KEY).</p>
              </div>
            ) : (
              <div className="space-y-3">
                {results.map((job) => {
                  const saved = savedIds.has(job.id);
                  const color = SOURCE_COLORS[job.source] ?? "bg-gray-100 text-gray-600 border-gray-200";
                  const postedDate = formatDate(job.postedAt);

                  return (
                    <div
                      key={job.id}
                      className="bg-card border border-border rounded-lg p-4 hover:shadow-sm transition-shadow"
                      data-testid={`job-listing-${job.id}`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-start gap-2 flex-wrap">
                            <h3 className="font-semibold text-sm text-foreground">{job.title}</h3>
                            {job.isRemote && (
                              <span className="text-xs bg-teal-100 text-teal-700 border border-teal-200 rounded-full px-1.5 py-0.5 font-medium">
                                Remote
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                            <span className="flex items-center gap-1">
                              <Building2 size={11} />
                              {job.company}
                            </span>
                            <span className="flex items-center gap-1">
                              <MapPin size={11} />
                              {job.location}
                            </span>
                            {job.salary && (
                              <span className="text-green-700 font-medium">{job.salary}</span>
                            )}
                            {postedDate && (
                              <span>{postedDate}</span>
                            )}
                          </div>
                          {job.snippet && (
                            <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                              {job.snippet}
                            </p>
                          )}
                          <span className={`inline-flex items-center border text-xs px-1.5 py-0.5 rounded font-medium mt-1 ${color}`}>
                            {job.source}
                          </span>
                        </div>

                        <div className="flex flex-col gap-2 shrink-0">
                          <a href={job.jobUrl} target="_blank" rel="noopener noreferrer">
                            <Button variant="outline" size="sm" className="text-xs h-7 w-full" data-testid={`button-view-${job.id}`}>
                              <ExternalLink size={11} className="mr-1" /> View
                            </Button>
                          </a>
                          <Button
                            size="sm"
                            variant={saved ? "outline" : "default"}
                            className="text-xs h-7 w-full"
                            onClick={() => !saved && handleSave(job)}
                            disabled={saved || createApp.isPending || isSavingAll}
                            data-testid={`button-save-${job.id}`}
                          >
                            {saved ? (
                              <><Check size={11} className="mr-1" /> Saved</>
                            ) : (
                              <><BookmarkPlus size={11} className="mr-1" /> Save</>
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* Initial empty state */}
        {results === null && !isSearching && (
          <div className="text-center py-16 text-muted-foreground" data-testid="search-empty-state">
            <Search size={40} className="mx-auto mb-4 opacity-20" />
            <p className="font-medium">Search for jobs across Europe and Turkey</p>
            <p className="text-xs mt-1">Enter a keyword and hit Search to pull results from all configured sources.</p>
          </div>
        )}
      </div>
    </div>
  );
}
