import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useGetProfile, useUpsertProfile, useParseCv, getGetProfileQueryKey } from "@workspace/api-client-react";
import { Save, Loader2, Info, Upload, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

const MAX_CV_BYTES = 8 * 1024 * 1024;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // reader.result is "data:application/pdf;base64,AAAA..." — strip the prefix.
      const result = reader.result as string;
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

const formSchema = z.object({
  resumeText: z.string().optional(),
  keySkills: z.string().optional(),
  careerSummary: z.string().optional(),
  pastRoles: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

function FieldCard({ title, pill, hint, children }: { title: string; pill?: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-[14px] p-5 shadow-card">
      <div className="flex items-center gap-2 mb-1">
        <h2 className="text-[14.5px] font-bold text-foreground">{title}</h2>
        {pill && <span className="text-[11px] font-semibold text-ember bg-ember-tint px-2 py-0.5 rounded-full">{pill}</span>}
      </div>
      <p className="text-xs text-muted-foreground mb-3">{hint}</p>
      {children}
    </div>
  );
}

export default function Profile() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);

  const { data: profile, isLoading } = useGetProfile({
    query: { queryKey: getGetProfileQueryKey() },
  });
  const upsertProfile = useUpsertProfile();
  const parseCv = useParseCv();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      resumeText: "",
      keySkills: "",
      careerSummary: "",
      pastRoles: "",
    },
  });

  useEffect(() => {
    if (profile) {
      form.reset({
        resumeText: profile.resumeText ?? "",
        keySkills: profile.keySkills ?? "",
        careerSummary: profile.careerSummary ?? "",
        pastRoles: profile.pastRoles ?? "",
      });
    }
  }, [profile]);

  function onSubmit(values: FormValues) {
    upsertProfile.mutate(
      { data: values },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetProfileQueryKey() });
          toast({ title: "Profile saved" });
        },
        onError: () => {
          toast({ title: "Failed to save profile", variant: "destructive" });
        },
      }
    );
  }

  async function handleCvUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file) return;

    if (file.type !== "application/pdf") {
      toast({ title: "Please upload a PDF file", variant: "destructive" });
      return;
    }
    if (file.size > MAX_CV_BYTES) {
      toast({ title: "That PDF is too large (max 8MB)", variant: "destructive" });
      return;
    }

    setUploadedFileName(file.name);
    const fileBase64 = await fileToBase64(file);

    parseCv.mutate(
      { fileBase64, fileName: file.name },
      {
        onSuccess: (parsed) => {
          form.reset({
            resumeText: parsed.resumeText,
            keySkills: parsed.keySkills,
            careerSummary: parsed.careerSummary,
            pastRoles: parsed.pastRoles,
          });
          toast({ title: "CV parsed — review the fields below, then save" });
        },
        onError: (err: unknown) => {
          const message =
            err && typeof err === "object" && "data" in err
              ? (err as { data?: { error?: string } }).data?.error ?? "Couldn't parse that CV"
              : "Couldn't parse that CV";
          toast({ title: message, variant: "destructive" });
          setUploadedFileName(null);
        },
      }
    );
  }

  return (
    <div className="max-w-[680px] mx-auto px-8 py-7 animate-rise">
      <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Your story</h1>
      <p className="text-sm text-muted-foreground mt-1 mb-5">
        Everything Tailor Studio knows about you. The richer this is, the sharper your materials.
      </p>

      <div className="bg-ochre-tint border border-ochre/20 rounded-[14px] p-3.5 mb-5 flex items-start gap-2" data-testid="profile-ai-tip">
        <Info size={14} className="text-ochre mt-0.5 shrink-0" />
        <p className="text-xs text-foreground">
          The more detail you provide — especially in your resume text and past roles — the more targeted and relevant the AI-generated content will be. At minimum, fill in your base resume text.
        </p>
      </div>

      <div className="bg-card border border-border rounded-[14px] p-5 shadow-card mb-5" data-testid="cv-upload-section">
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center w-11 h-11 rounded-[12px] bg-sage-tint text-sage shrink-0">
            <FileText size={20} />
          </span>
          <div className="flex-1 min-w-0">
            {uploadedFileName ? (
              <p className="text-sm font-bold text-foreground truncate">{uploadedFileName}</p>
            ) : (
              <p className="text-sm font-bold text-foreground">Upload your CV</p>
            )}
            <p className="text-xs text-muted-foreground">
              {parseCv.isPending ? "Reading your CV…" : "Auto-fills the fields below — review and edit before saving."}
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={handleCvUpload}
            data-testid="input-cv-file"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-[10px] shrink-0"
            disabled={parseCv.isPending}
            onClick={() => fileInputRef.current?.click()}
            data-testid="button-upload-cv"
          >
            {parseCv.isPending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <><Upload size={14} className="mr-1.5" /> {uploadedFileName ? "Replace CV" : "Upload CV (PDF)"}</>
            )}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-40 w-full rounded-[14px]" />
          <Skeleton className="h-24 w-full rounded-[14px]" />
          <Skeleton className="h-24 w-full rounded-[14px]" />
        </div>
      ) : (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4" data-testid="form-profile">
            <FieldCard title="Base resume" pill="most important" hint="Paste your full resume text here. This is the most important field for AI tailoring.">
              <FormField
                control={form.control}
                name="resumeText"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Textarea
                        placeholder="Paste your complete resume text here — work experience, education, skills, etc..."
                        rows={10}
                        data-testid="textarea-resume"
                        className="rounded-[9px] bg-background leading-relaxed"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </FieldCard>

            <FieldCard title="Career summary" hint="A short paragraph describing your professional identity and goals.">
              <FormField
                control={form.control}
                name="careerSummary"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Textarea
                        placeholder="A results-driven software engineer with 5 years of experience building..."
                        rows={3}
                        data-testid="textarea-career-summary"
                        className="rounded-[9px] bg-background leading-relaxed"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </FieldCard>

            <FieldCard title="Key skills" hint="Used to compute match scores for job search and to highlight relevant expertise for each role.">
              <FormField
                control={form.control}
                name="keySkills"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Textarea
                        placeholder="TypeScript, React, Node.js, PostgreSQL, AWS, System Design, Agile..."
                        rows={2}
                        data-testid="textarea-skills"
                        className="rounded-[9px] bg-background leading-relaxed"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </FieldCard>

            <FieldCard title="Past roles & achievements" hint="The AI uses this to pull relevant experience into tailored bullets.">
              <FormField
                control={form.control}
                name="pastRoles"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Textarea
                        placeholder="Senior Engineer at Acme (2021-2024): Led migration of monolith to microservices, reducing API latency by 40%. Built real-time analytics dashboard serving 500k users...&#10;&#10;Engineer at StartupXYZ (2019-2021): Built payment processing pipeline..."
                        rows={6}
                        data-testid="textarea-past-roles"
                        className="rounded-[9px] bg-background leading-relaxed"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </FieldCard>

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={upsertProfile.isPending} className="h-[42px] rounded-[11px] font-bold px-5" data-testid="button-save-profile">
                {upsertProfile.isPending ? (
                  <><Loader2 size={14} className="mr-2 animate-spin" /> Saving...</>
                ) : (
                  <><Save size={14} className="mr-2" /> Save profile</>
                )}
              </Button>
              {profile?.updatedAt && (
                <span className="text-xs text-muted-foreground">
                  Last saved: {new Date(profile.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </span>
              )}
            </div>
          </form>
        </Form>
      )}
    </div>
  );
}
