import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  useGetApplication,
  useUpdateApplication,
  useDeleteApplication,
  useGetTailoredContent,
  useSaveTailoredContent,
  useTailorMaterials,
  useGetProfile,
  getGetApplicationQueryKey,
  getListApplicationsQueryKey,
  getGetDashboardStatsQueryKey,
  getGetTailoredContentQueryKey,
  getGetOverdueFollowUpsQueryKey,
  type ApplicationUpdateStatus,
} from "@workspace/api-client-react";
import {
  ArrowLeft,
  Trash2,
  Wand2,
  Save,
  ExternalLink,
  Loader2,
  Send,
  CheckCircle2,
  Copy,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { STATUS_LIST, type Status } from "@/lib/statusColors";
import { isSafeUrl } from "@/lib/url";

const EUROPEAN_COUNTRIES = [
  "Austria", "Belgium", "Bulgaria", "Croatia", "Czech Republic", "Denmark",
  "Estonia", "Finland", "France", "Germany", "Greece", "Hungary", "Ireland",
  "Italy", "Latvia", "Lithuania", "Luxembourg", "Malta", "Netherlands", "Norway",
  "Poland", "Portugal", "Romania", "Slovakia", "Slovenia", "Spain", "Sweden",
  "Switzerland", "Turkey", "Ukraine", "United Kingdom", "Remote - EU", "Remote - Global",
];

const STAGE_ORDER = ["Saved", "Applied", "Interviewing", "Offer"] as const;
const TERMINAL_STATUSES = ["Rejected", "Withdrawn"] as const;

const formSchema = z.object({
  companyName: z.string().min(1, "Company name is required"),
  roleTitle: z.string().min(1, "Role title is required"),
  country: z.string().optional(),
  jobPostingUrl: z.string().refine((v) => v === "" || /^https?:\/\//i.test(v), "Must be an http(s) URL").optional(),
  jobDescription: z.string().optional(),
  status: z.string(),
  applicationMethod: z.string().optional(),
  notes: z.string().optional(),
  followUpDate: z.string().optional(),
  dateApplied: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="inline-flex items-center gap-1.5 h-[26px] px-2.5 rounded-[7px] text-[11.5px] font-semibold bg-chip text-foreground hover:bg-ember-tint hover:text-ember transition-colors"
    >
      {copied ? <Check size={11} /> : <Copy size={11} />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function StageStepper({ status }: { status: string }) {
  if ((TERMINAL_STATUSES as readonly string[]).includes(status)) {
    return (
      <div className="bg-card border border-border rounded-[14px] px-5 py-4 shadow-card mb-4 text-center">
        <span className="inline-flex items-center gap-2 text-[13px] font-semibold text-destructive bg-destructive/10 px-3 py-1 rounded-full">
          {status}
        </span>
      </div>
    );
  }

  const currentIndex = STAGE_ORDER.indexOf(status as (typeof STAGE_ORDER)[number]);

  return (
    <div className="bg-card border border-border rounded-[14px] px-5 py-4 shadow-card mb-4">
      <div className="flex items-center">
        {STAGE_ORDER.map((stage, i) => {
          const done = currentIndex > i || currentIndex === -1;
          const isCurrent = i === currentIndex;
          return (
            <div key={stage} className="flex-1 flex items-center">
              <div className="flex-1 flex flex-col items-center gap-1.5">
                <span
                  className={`flex items-center justify-center w-[26px] h-[26px] rounded-full border-2 text-[11px] font-bold ${
                    done
                      ? "bg-sage border-sage text-primary-foreground"
                      : isCurrent
                        ? "bg-ember border-ember text-primary-foreground"
                        : "bg-chip border-border text-muted-foreground"
                  }`}
                >
                  {done ? <Check size={12} strokeWidth={3} /> : i + 1}
                </span>
                <span className={`text-xs ${isCurrent ? "font-bold text-foreground" : done ? "text-foreground" : "text-muted-foreground"}`}>
                  {stage}
                </span>
              </div>
              {i < STAGE_ORDER.length - 1 && (
                <div className={`h-0.5 flex-1 rounded-full mb-5 mx-1 ${currentIndex > i ? "bg-sage" : "bg-border"}`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function ApplicationDetail({ id }: { id: string }) {
  const appId = parseInt(id, 10);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showApplyDialog, setShowApplyDialog] = useState(false);

  // Editable AI output
  const [resumeBullets, setResumeBullets] = useState("");
  const [coverLetter, setCoverLetter] = useState("");
  const [atsKeywords, setAtsKeywords] = useState("");

  const { data: application, isLoading } = useGetApplication(appId, {
    query: { enabled: !!appId, queryKey: getGetApplicationQueryKey(appId) },
  });

  const { data: tailoredContent } = useGetTailoredContent(appId, {
    query: { enabled: !!appId, queryKey: getGetTailoredContentQueryKey(appId) },
  });

  const { data: profile } = useGetProfile();

  const updateApp = useUpdateApplication();
  const deleteApp = useDeleteApplication();
  const tailorMaterials = useTailorMaterials();
  const saveTailored = useSaveTailoredContent();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      companyName: "",
      roleTitle: "",
      country: "",
      jobPostingUrl: "",
      jobDescription: "",
      status: "Saved",
      applicationMethod: "",
      notes: "",
      followUpDate: "",
      dateApplied: "",
    },
  });

  useEffect(() => {
    if (application) {
      form.reset({
        companyName: application.companyName,
        roleTitle: application.roleTitle,
        country: application.country ?? "",
        jobPostingUrl: application.jobPostingUrl ?? "",
        jobDescription: application.jobDescription ?? "",
        status: application.status,
        applicationMethod: application.applicationMethod ?? "",
        notes: application.notes ?? "",
        followUpDate: application.followUpDate ?? "",
        dateApplied: application.dateApplied ?? "",
      });
    }
  }, [application]);

  useEffect(() => {
    if (tailoredContent) {
      setResumeBullets(tailoredContent.resumeBullets ?? "");
      setCoverLetter(tailoredContent.coverLetterParagraph ?? "");
      setAtsKeywords(tailoredContent.atsKeywords ?? "");
    }
  }, [tailoredContent]);

  function onSubmit(values: FormValues) {
    updateApp.mutate(
      {
        id: appId,
        data: {
          companyName: values.companyName,
          roleTitle: values.roleTitle,
          ...(values.country !== undefined && { country: values.country }),
          ...(values.jobPostingUrl !== undefined && { jobPostingUrl: values.jobPostingUrl }),
          ...(values.jobDescription !== undefined && { jobDescription: values.jobDescription }),
          status: values.status as ApplicationUpdateStatus,
          ...(values.applicationMethod !== undefined && { applicationMethod: values.applicationMethod }),
          ...(values.notes !== undefined && { notes: values.notes }),
          ...(values.followUpDate !== undefined && { followUpDate: values.followUpDate }),
          ...(values.dateApplied !== undefined && { dateApplied: values.dateApplied }),
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetApplicationQueryKey(appId) });
          queryClient.invalidateQueries({ queryKey: getListApplicationsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetOverdueFollowUpsQueryKey() });
          toast({ title: "Application saved" });
        },
        onError: () => {
          toast({ title: "Failed to save", variant: "destructive" });
        },
      }
    );
  }

  function handleDelete() {
    deleteApp.mutate(
      { id: appId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListApplicationsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetOverdueFollowUpsQueryKey() });
          toast({ title: "Application deleted" });
          setLocation("/");
        },
      }
    );
  }

  function handleOpenAndApply() {
    if (isSafeUrl(application?.jobPostingUrl)) {
      window.open(application.jobPostingUrl, "_blank", "noopener,noreferrer");
    }
    // Show "Did you apply?" dialog after a short delay
    setTimeout(() => setShowApplyDialog(true), 500);
  }

  function handleConfirmApplied() {
    const today = new Date().toISOString().split("T")[0];
    updateApp.mutate(
      {
        id: appId,
        data: {
          status: "Applied" as ApplicationUpdateStatus,
          dateApplied: today,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetApplicationQueryKey(appId) });
          queryClient.invalidateQueries({ queryKey: getListApplicationsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() });
          toast({ title: "Status updated to Applied" });
          setShowApplyDialog(false);
        },
      }
    );
  }

  function handleTailor() {
    tailorMaterials.mutate(
      { data: { applicationId: appId } },
      {
        onSuccess: (result) => {
          setResumeBullets(result.resumeBullets);
          setCoverLetter(result.coverLetterParagraph);
          setAtsKeywords(result.atsKeywords);
          queryClient.invalidateQueries({ queryKey: getGetTailoredContentQueryKey(appId) });
          toast({ title: "AI tailoring complete" });
        },
        onError: (err: unknown) => {
          const message =
            err && typeof err === "object" && "data" in err
              ? (err as { data?: { error?: string } }).data?.error ?? "AI tailoring failed"
              : "AI tailoring failed";
          toast({ title: message, variant: "destructive" });
        },
      }
    );
  }

  function handleSaveAi() {
    saveTailored.mutate(
      {
        id: appId,
        data: {
          resumeBullets,
          coverLetterParagraph: coverLetter,
          atsKeywords,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetTailoredContentQueryKey(appId) });
          toast({ title: "AI content saved" });
        },
        onError: () => {
          toast({ title: "Failed to save AI content", variant: "destructive" });
        },
      }
    );
  }

  function handleDownload() {
    const content = [
      `${application?.roleTitle} at ${application?.companyName}`,
      application?.country ? `Location: ${application.country}` : "",
      "",
      "── RESUME BULLETS ──",
      resumeBullets,
      "",
      "── COVER LETTER PARAGRAPH ──",
      coverLetter,
      "",
      "── ATS KEYWORDS ──",
      atsKeywords,
    ].filter((line) => line !== undefined).join("\n");

    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tailored-${application?.companyName ?? "application"}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (isLoading) {
    return (
      <div className="max-w-[1080px] mx-auto px-8 py-7 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!application) {
    return (
      <div className="max-w-[1080px] mx-auto px-8 py-12 text-center">
        <p className="text-muted-foreground">Application not found.</p>
        <Link href="/">
          <Button variant="link" className="mt-2 text-ember">Back to Dashboard</Button>
        </Link>
      </div>
    );
  }

  const canApply = application.status === "Saved" && isSafeUrl(application.jobPostingUrl);
  const hasTailored = !!(resumeBullets || coverLetter || atsKeywords);
  const hasProfile = !!profile?.resumeText;
  const hasJobDescription = !!application.jobDescription;
  const keywordChips = atsKeywords.split(",").map((k) => k.trim()).filter(Boolean);

  return (
    <div className="max-w-[1080px] mx-auto px-8 py-7 animate-rise">
      <Link href="/">
        <button className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted-foreground hover:text-ember mb-3.5" data-testid="button-back">
          <ArrowLeft size={14} />
          Back to pipeline
        </button>
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
        <div className="flex items-center gap-3.5">
          <span className="flex items-center justify-center w-[52px] h-[52px] rounded-[14px] bg-ember-tint text-ember font-display text-xl font-bold shrink-0">
            {application.companyName.charAt(0).toUpperCase()}
          </span>
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">{application.roleTitle}</h1>
            <p className="text-[14.5px] text-muted-foreground mt-0.5">
              {application.companyName}
              {application.country && <> · {application.country}</>}
              {application.source && application.source !== "Manual" && <> · via {application.source}</>}
              {isSafeUrl(application.jobPostingUrl) && (
                <> · <a href={application.jobPostingUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-ember">view posting ↗</a></>
              )}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="text-destructive hover:text-destructive border-destructive/30 hover:border-destructive/60 hover:bg-destructive/10"
          onClick={() => setShowDeleteDialog(true)}
          data-testid="button-delete"
        >
          <Trash2 size={13} className="mr-1.5" /> Delete
        </Button>
      </div>

      {/* Stage stepper */}
      <StageStepper status={application.status} />
      {(application.followUpDate || application.dateApplied) && !(TERMINAL_STATUSES as readonly string[]).includes(application.status) && (
        <p className="text-center text-[13px] text-muted-foreground -mt-2 mb-4">
          {application.dateApplied && <>Applied on <strong className="text-foreground">{application.dateApplied}</strong></>}
          {application.dateApplied && application.followUpDate && <> · </>}
          {application.followUpDate && <>follow-up reminder <strong className="text-foreground">{application.followUpDate}</strong></>}
        </p>
      )}

      {/* Apply Assist */}
      {canApply && (
        <div className="bg-ember-tint border border-ember-tint-border rounded-[14px] p-4 mb-4 flex items-center justify-between gap-4 flex-wrap" data-testid="apply-assist-panel">
          <div className="text-sm text-foreground">
            <p className="font-semibold mb-0.5">Ready to apply</p>
            <p className="text-xs text-muted-foreground">Opens the posting, then confirm below once you've submitted.</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" onClick={handleOpenAndApply} data-testid="button-apply-assist" className="rounded-[10px] font-bold">
              <Send size={13} className="mr-1.5" /> Open & apply
            </Button>
            {hasTailored && (
              <Button variant="outline" size="sm" onClick={handleDownload} data-testid="button-download" className="rounded-[10px]">
                Download materials
              </Button>
            )}
          </div>
        </div>
      )}
      {application.status !== "Saved" && isSafeUrl(application.jobPostingUrl) && (
        <div className="bg-card border border-border rounded-[14px] p-4 mb-4 flex items-center justify-between gap-4 shadow-card">
          <div className="text-sm text-muted-foreground">
            {application.status === "Applied" ? (
              <span className="flex items-center gap-2 text-sage font-semibold">
                <CheckCircle2 size={14} />
                Applied{application.dateApplied ? ` on ${application.dateApplied}` : ""}
              </span>
            ) : (
              <span>Status: <strong className="text-foreground">{application.status}</strong></span>
            )}
          </div>
          <a href={application.jobPostingUrl} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm" className="rounded-[10px]" data-testid="button-job-link-2">
              <ExternalLink size={13} className="mr-1.5" /> View posting
            </Button>
          </a>
        </div>
      )}

      {/* Two-column: Tailor Studio + Details */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_1fr] gap-4 items-start pb-8">
        {/* Tailor Studio */}
        <div
          className="rounded-2xl border border-ember-tint-border shadow-card p-5 min-w-0"
          style={{ background: "linear-gradient(160deg, hsl(var(--ember-tint)), hsl(var(--card)) 55%)" }}
          data-testid="ai-tailoring-panel"
        >
          <div className="flex items-center gap-2.5 mb-1.5">
            <span className="flex items-center justify-center w-[34px] h-[34px] rounded-[10px] bg-ember text-primary-foreground shrink-0">
              <Wand2 size={16} />
            </span>
            <div>
              <h2 className="font-display text-[17px] font-bold text-foreground">Tailor Studio</h2>
              <p className="text-[12.5px] text-muted-foreground">Materials written for this exact role, from your profile</p>
            </div>
          </div>

          <div className="flex gap-2 my-3.5 flex-wrap items-center">
            <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${hasProfile ? "text-sage bg-sage-tint" : "text-ochre bg-ochre-tint"}`}>
              {hasProfile ? <Check size={11} strokeWidth={3} /> : null}
              {hasProfile ? "Profile ready" : "Add your profile"}
            </span>
            <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${hasJobDescription ? "text-sage bg-sage-tint" : "text-ochre bg-ochre-tint"}`}>
              {hasJobDescription ? <Check size={11} strokeWidth={3} /> : null}
              {hasJobDescription ? "Job description added" : "Add job description"}
            </span>
            <Button
              size="sm"
              onClick={handleTailor}
              disabled={tailorMaterials.isPending}
              className="ml-auto rounded-[10px] font-bold"
              data-testid="button-tailor"
            >
              {tailorMaterials.isPending ? (
                <><Loader2 size={13} className="mr-1.5 animate-spin" /> Tailoring…</>
              ) : hasTailored ? "Re-tailor" : "Tailor now"}
            </Button>
          </div>

          {(hasTailored || tailorMaterials.isPending) ? (
            <div className="flex flex-col gap-2.5">
              <div className="bg-card border border-border rounded-xl p-3.5">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-[0.07em]">Resume bullets</p>
                  <CopyButton text={resumeBullets} />
                </div>
                <Textarea
                  value={resumeBullets}
                  onChange={(e) => setResumeBullets(e.target.value)}
                  rows={5}
                  placeholder={tailorMaterials.isPending ? "Generating…" : "AI resume bullets will appear here"}
                  disabled={tailorMaterials.isPending}
                  className="text-[13.5px] leading-relaxed border-0 bg-transparent p-0 resize-none focus-visible:ring-0 shadow-none"
                  data-testid="textarea-resume-bullets"
                />
              </div>
              <div className="bg-card border border-border rounded-xl p-3.5">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-[0.07em]">Cover letter paragraph</p>
                  <CopyButton text={coverLetter} />
                </div>
                <Textarea
                  value={coverLetter}
                  onChange={(e) => setCoverLetter(e.target.value)}
                  rows={4}
                  placeholder={tailorMaterials.isPending ? "Generating…" : "AI cover letter paragraph will appear here"}
                  disabled={tailorMaterials.isPending}
                  className="text-[13.5px] leading-relaxed border-0 bg-transparent p-0 resize-none focus-visible:ring-0 shadow-none"
                  data-testid="textarea-cover-letter"
                />
              </div>
              <div className="bg-card border border-border rounded-xl p-3.5">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-[0.07em] mb-2">ATS keywords</p>
                {keywordChips.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {keywordChips.map((kw) => (
                      <span key={kw} className="text-xs font-semibold px-2.5 py-1 rounded-full bg-chip text-foreground">{kw}</span>
                    ))}
                  </div>
                )}
                <Textarea
                  value={atsKeywords}
                  onChange={(e) => setAtsKeywords(e.target.value)}
                  rows={2}
                  placeholder={tailorMaterials.isPending ? "Generating…" : "Comma-separated keywords"}
                  disabled={tailorMaterials.isPending}
                  className="text-[13px] border-0 bg-transparent p-0 resize-none focus-visible:ring-0 shadow-none"
                  data-testid="textarea-ats-keywords"
                />
                <p className="text-xs text-muted-foreground mt-1">Ensure these keywords appear in your resume for ATS matching.</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  onClick={handleSaveAi}
                  variant="outline"
                  size="sm"
                  className="rounded-[10px]"
                  disabled={saveTailored.isPending || tailorMaterials.isPending}
                  data-testid="button-save-ai"
                >
                  {saveTailored.isPending ? (
                    <><Loader2 size={13} className="mr-1.5 animate-spin" /> Saving…</>
                  ) : (
                    <><Save size={13} className="mr-1.5" /> Save edits</>
                  )}
                </Button>
                {hasTailored && !tailorMaterials.isPending && (
                  <Button variant="ghost" size="sm" onClick={handleDownload} data-testid="button-download-ai">
                    Download all as .txt
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <p className="text-[13px] text-muted-foreground bg-card border border-border rounded-xl p-4 text-center">
              Fill in your profile and paste the job description, then hit Tailor now.
            </p>
          )}
        </div>

        {/* Details */}
        <div className="bg-card border border-border rounded-[14px] p-5 shadow-card min-w-0" data-testid="details-card">
          <h2 className="text-[14.5px] font-bold text-foreground mb-3.5">Details</h2>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-3" data-testid="form-edit-application">
              <div className="grid grid-cols-2 gap-2.5">
                <FormField
                  control={form.control}
                  name="companyName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-semibold text-muted-foreground">Company</FormLabel>
                      <FormControl>
                        <Input data-testid="input-company-name" className="h-9 rounded-[9px] bg-background text-[13.5px]" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="roleTitle"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-semibold text-muted-foreground">Role</FormLabel>
                      <FormControl>
                        <Input data-testid="input-role-title" className="h-9 rounded-[9px] bg-background text-[13.5px]" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <FormField
                  control={form.control}
                  name="country"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-semibold text-muted-foreground">Country / Location</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-country" className="h-9 rounded-[9px] bg-background text-[13.5px]">
                            <SelectValue placeholder="Select country..." />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="">Not specified</SelectItem>
                          <SelectItem value="Remote - EU">Remote - EU</SelectItem>
                          <SelectItem value="Remote - Global">Remote - Global</SelectItem>
                          {EUROPEAN_COUNTRIES.filter(c => !c.startsWith("Remote")).map((c) => (
                            <SelectItem key={c} value={c}>{c}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-semibold text-muted-foreground">Status</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-status" className="h-9 rounded-[9px] bg-background text-[13.5px]">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {STATUS_LIST.map((s) => (
                            <SelectItem key={s} value={s}>{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <FormField
                  control={form.control}
                  name="applicationMethod"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-semibold text-muted-foreground">Method</FormLabel>
                      <FormControl>
                        <Input placeholder="Company site, Referral..." data-testid="input-method" className="h-9 rounded-[9px] bg-background text-[13.5px]" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="followUpDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-semibold text-muted-foreground">Follow-up</FormLabel>
                      <FormControl>
                        <Input type="date" data-testid="input-follow-up-date" className="h-9 rounded-[9px] bg-background text-[13.5px]" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="dateApplied"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold text-muted-foreground">Date Applied</FormLabel>
                    <FormControl>
                      <Input type="date" data-testid="input-date-applied" className="h-9 rounded-[9px] bg-background text-[13.5px]" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="jobPostingUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold text-muted-foreground">Job Posting URL</FormLabel>
                    <FormControl>
                      <Input placeholder="https://..." data-testid="input-job-url" className="h-9 rounded-[9px] bg-background text-[13.5px]" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="jobDescription"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold text-muted-foreground">Job description</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Paste the full job description here..."
                        rows={4}
                        data-testid="textarea-job-description"
                        className="rounded-[9px] bg-background text-[13.5px] leading-relaxed"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold text-muted-foreground">Notes</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Contacts, interview prep, context..."
                        rows={3}
                        data-testid="textarea-notes"
                        className="rounded-[9px] bg-background text-[13.5px] leading-relaxed"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" disabled={updateApp.isPending} size="sm" className="self-start rounded-[10px] font-bold" data-testid="button-save">
                {updateApp.isPending ? (
                  <><Loader2 size={13} className="mr-1.5 animate-spin" /> Saving...</>
                ) : (
                  <><Save size={13} className="mr-1.5" /> Save changes</>
                )}
              </Button>
            </form>
          </Form>
        </div>
      </div>

      {/* Delete Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="rounded-[14px]">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete application?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this application and all AI-tailored content. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Did you apply? Dialog */}
      <AlertDialog open={showApplyDialog} onOpenChange={setShowApplyDialog}>
        <AlertDialogContent className="rounded-[14px]">
          <AlertDialogHeader>
            <AlertDialogTitle>Did you submit your application?</AlertDialogTitle>
            <AlertDialogDescription>
              If you clicked Apply on the company's site, confirm below — this will update your status to Applied and record today's date.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-not-yet">Not yet</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmApplied} data-testid="button-confirm-applied">
              Yes, I applied
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
