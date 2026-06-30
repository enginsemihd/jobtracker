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
  ChevronDown,
  ChevronUp,
  Send,
  CheckCircle2,
  MapPin,
  Tag,
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
import { STATUS_LIST, STATUS_COLORS, type Status } from "@/lib/statusColors";

const EUROPEAN_COUNTRIES = [
  "Austria", "Belgium", "Bulgaria", "Croatia", "Czech Republic", "Denmark",
  "Estonia", "Finland", "France", "Germany", "Greece", "Hungary", "Ireland",
  "Italy", "Latvia", "Lithuania", "Luxembourg", "Malta", "Netherlands", "Norway",
  "Poland", "Portugal", "Romania", "Slovakia", "Slovenia", "Spain", "Sweden",
  "Switzerland", "Turkey", "Ukraine", "United Kingdom", "Remote - EU", "Remote - Global",
];

const formSchema = z.object({
  companyName: z.string().min(1, "Company name is required"),
  roleTitle: z.string().min(1, "Role title is required"),
  country: z.string().optional(),
  jobPostingUrl: z.string().optional(),
  jobDescription: z.string().optional(),
  status: z.string(),
  applicationMethod: z.string().optional(),
  notes: z.string().optional(),
  followUpDate: z.string().optional(),
  dateApplied: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export default function ApplicationDetail({ id }: { id: string }) {
  const appId = parseInt(id, 10);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showApplyDialog, setShowApplyDialog] = useState(false);
  const [aiSectionOpen, setAiSectionOpen] = useState(false);

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
      if (tailoredContent.resumeBullets) setAiSectionOpen(true);
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
    if (application?.jobPostingUrl) {
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
    setAiSectionOpen(true);
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
      <div className="max-w-2xl mx-auto px-6 py-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!application) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-12 text-center">
        <p className="text-muted-foreground">Application not found.</p>
        <Link href="/">
          <Button variant="link" className="mt-2">Back to Dashboard</Button>
        </Link>
      </div>
    );
  }

  const statusColors = STATUS_COLORS[application.status as Status] ?? STATUS_COLORS.Saved;
  const canApply = application.status === "Saved" && !!application.jobPostingUrl;
  const hasTailored = !!(resumeBullets || coverLetter || atsKeywords);

  return (
    <div className="max-w-2xl mx-auto px-6 py-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div className="flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="icon" className="h-8 w-8" data-testid="button-back">
              <ArrowLeft size={16} />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-foreground">{application.companyName}</h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-sm text-muted-foreground">{application.roleTitle}</span>
              {application.country && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin size={11} />
                  {application.country}
                </span>
              )}
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusColors.badge}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${statusColors.dot}`} />
                {application.status}
              </span>
              {application.source && application.source !== "Manual" && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                  <Tag size={10} />
                  {application.source}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {application.jobPostingUrl && !canApply && (
            <a href={application.jobPostingUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm" data-testid="button-job-link">
                <ExternalLink size={13} className="mr-1.5" /> Posting
              </Button>
            </a>
          )}
          {canApply && (
            <Button size="sm" onClick={handleOpenAndApply} data-testid="button-apply">
              <Send size={13} className="mr-1.5" /> Open & Apply
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive border-destructive/30 hover:border-destructive/60"
            onClick={() => setShowDeleteDialog(true)}
            data-testid="button-delete"
          >
            <Trash2 size={13} className="mr-1.5" /> Delete
          </Button>
        </div>
      </div>

      {/* Apply Assist info when applied */}
      {application.status !== "Saved" && application.jobPostingUrl && (
        <div className="bg-card border border-border rounded-lg p-4 mb-6 flex items-center justify-between gap-4">
          <div className="text-sm text-muted-foreground">
            {application.status === "Applied" ? (
              <span className="flex items-center gap-2 text-green-700">
                <CheckCircle2 size={14} />
                Applied{application.dateApplied ? ` on ${application.dateApplied}` : ""}
              </span>
            ) : (
              <span>Status: <strong className="text-foreground">{application.status}</strong></span>
            )}
          </div>
          <a href={application.jobPostingUrl} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm" data-testid="button-job-link-2">
              <ExternalLink size={13} className="mr-1.5" /> View Posting
            </Button>
          </a>
        </div>
      )}

      {/* Edit Form */}
      <div className="bg-card border border-border rounded-lg p-5 mb-6">
        <h2 className="text-sm font-semibold text-foreground mb-4">Application Details</h2>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" data-testid="form-edit-application">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="companyName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Company Name</FormLabel>
                    <FormControl>
                      <Input data-testid="input-company-name" {...field} />
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
                    <FormLabel>Role Title</FormLabel>
                    <FormControl>
                      <Input data-testid="input-role-title" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="country"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Country / Location</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-country">
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
                    <FormLabel>Status</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-status">
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="applicationMethod"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Application Method</FormLabel>
                    <FormControl>
                      <Input placeholder="Company site, Referral..." data-testid="input-method" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="dateApplied"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date Applied</FormLabel>
                    <FormControl>
                      <Input type="date" data-testid="input-date-applied" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="jobPostingUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Job Posting URL</FormLabel>
                  <FormControl>
                    <Input placeholder="https://..." data-testid="input-job-url" {...field} />
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
                  <FormLabel>Job Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Paste the full job description here..."
                      rows={6}
                      data-testid="textarea-job-description"
                      {...field}
                    />
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
                  <FormLabel>Follow-up Reminder</FormLabel>
                  <FormControl>
                    <Input type="date" data-testid="input-follow-up-date" {...field} />
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
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Contacts, interview prep, context..."
                      rows={3}
                      data-testid="textarea-notes"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" disabled={updateApp.isPending} size="sm" data-testid="button-save">
              {updateApp.isPending ? (
                <><Loader2 size={13} className="mr-1.5 animate-spin" /> Saving...</>
              ) : (
                <><Save size={13} className="mr-1.5" /> Save Changes</>
              )}
            </Button>
          </form>
        </Form>
      </div>

      {/* Apply Assist Panel */}
      {canApply && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mb-6" data-testid="apply-assist-panel">
          <div className="flex items-center gap-2 mb-2">
            <Send size={15} className="text-indigo-600" />
            <span className="text-sm font-semibold text-indigo-900">Apply Assist</span>
          </div>
          <p className="text-xs text-indigo-700 mb-3">
            Click to open the original job posting in a new tab. Once you've submitted your application on the company's site, confirm below to update your status.
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" onClick={handleOpenAndApply} data-testid="button-apply-assist">
              <ExternalLink size={13} className="mr-1.5" /> Open Posting & Apply
            </Button>
            {hasTailored && (
              <Button variant="outline" size="sm" onClick={handleDownload} data-testid="button-download">
                Download Tailored Materials
              </Button>
            )}
          </div>
        </div>
      )}

      {/* AI Tailoring Panel */}
      <div className="bg-card border border-border rounded-lg overflow-hidden mb-6" data-testid="ai-tailoring-panel">
        <button
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors"
          onClick={() => setAiSectionOpen(!aiSectionOpen)}
          data-testid="button-toggle-ai-section"
        >
          <div className="flex items-center gap-2">
            <Wand2 size={16} className="text-primary" />
            <span className="font-semibold text-sm text-foreground">AI Tailoring Assistant</span>
            {tailoredContent?.resumeBullets && (
              <span className="text-xs bg-green-100 text-green-700 border border-green-200 rounded-full px-2 py-0.5">
                Content saved
              </span>
            )}
          </div>
          {aiSectionOpen ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
        </button>

        {aiSectionOpen && (
          <div className="border-t border-border px-5 py-4 space-y-4">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Uses your profile (resume, skills, career summary) and this job description to generate tailored resume bullets, a cover letter paragraph, and ATS keywords. Fill in your profile and paste the job description first.
            </p>

            <Button
              onClick={handleTailor}
              disabled={tailorMaterials.isPending}
              className="w-full sm:w-auto"
              data-testid="button-tailor"
            >
              {tailorMaterials.isPending ? (
                <><Loader2 size={14} className="mr-2 animate-spin" /> Tailoring with Claude...</>
              ) : (
                <><Wand2 size={14} className="mr-2" /> Tailor My Materials</>
              )}
            </Button>

            {(resumeBullets || coverLetter || atsKeywords || tailorMaterials.isPending) && (
              <div className="space-y-4 mt-2">
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5 uppercase tracking-wider">
                    Resume Bullets
                  </label>
                  <Textarea
                    value={resumeBullets}
                    onChange={(e) => setResumeBullets(e.target.value)}
                    rows={6}
                    placeholder={tailorMaterials.isPending ? "Generating..." : "AI resume bullets will appear here"}
                    disabled={tailorMaterials.isPending}
                    className="text-sm font-mono"
                    data-testid="textarea-resume-bullets"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5 uppercase tracking-wider">
                    Cover Letter Paragraph
                  </label>
                  <Textarea
                    value={coverLetter}
                    onChange={(e) => setCoverLetter(e.target.value)}
                    rows={5}
                    placeholder={tailorMaterials.isPending ? "Generating..." : "AI cover letter paragraph will appear here"}
                    disabled={tailorMaterials.isPending}
                    className="text-sm"
                    data-testid="textarea-cover-letter"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5 uppercase tracking-wider">
                    ATS Keywords
                  </label>
                  <Textarea
                    value={atsKeywords}
                    onChange={(e) => setAtsKeywords(e.target.value)}
                    rows={3}
                    placeholder={tailorMaterials.isPending ? "Generating..." : "Comma-separated keywords will appear here"}
                    disabled={tailorMaterials.isPending}
                    className="text-sm"
                    data-testid="textarea-ats-keywords"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Ensure these keywords appear in your resume for ATS matching.
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    onClick={handleSaveAi}
                    variant="outline"
                    size="sm"
                    disabled={saveTailored.isPending || tailorMaterials.isPending}
                    data-testid="button-save-ai"
                  >
                    {saveTailored.isPending ? (
                      <><Loader2 size={13} className="mr-1.5 animate-spin" /> Saving...</>
                    ) : (
                      <><Save size={13} className="mr-1.5" /> Save Edits</>
                    )}
                  </Button>
                  {hasTailored && !tailorMaterials.isPending && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleDownload}
                      data-testid="button-download-ai"
                    >
                      Download as .txt
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Delete Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
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
        <AlertDialogContent>
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
