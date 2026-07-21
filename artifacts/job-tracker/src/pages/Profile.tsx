import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useGetProfile, useUpsertProfile, useParseCv, getGetProfileQueryKey } from "@workspace/api-client-react";
import { Save, Loader2, UserCircle, Info, Upload, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
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
    <div className="max-w-2xl mx-auto px-6 py-6">
      <div className="flex items-center gap-3 mb-2">
        <UserCircle size={22} className="text-primary" />
        <h1 className="text-xl font-semibold text-foreground">Your Profile</h1>
      </div>
      <p className="text-sm text-muted-foreground mb-6">
        This information is used as context when the AI Tailoring Assistant generates tailored resume bullets, cover letter paragraphs, and ATS keywords for each job application.
      </p>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-6 flex items-start gap-2" data-testid="profile-ai-tip">
        <Info size={14} className="text-amber-600 mt-0.5 shrink-0" />
        <p className="text-xs text-amber-800">
          The more detail you provide — especially in your resume text and past roles — the more targeted and relevant the AI-generated content will be. At minimum, fill in your base resume text.
        </p>
      </div>

      <div className="border border-dashed border-border rounded-lg p-4 mb-6" data-testid="cv-upload-section">
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={handleCvUpload}
          data-testid="input-cv-file"
        />
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={parseCv.isPending}
            onClick={() => fileInputRef.current?.click()}
            data-testid="button-upload-cv"
          >
            {parseCv.isPending ? (
              <><Loader2 size={14} className="mr-2 animate-spin" /> Reading your CV…</>
            ) : (
              <><Upload size={14} className="mr-2" /> Upload CV (PDF)</>
            )}
          </Button>
          {uploadedFileName && !parseCv.isPending && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <FileText size={12} /> {uploadedFileName}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Auto-fills the fields below from your resume — review and edit before saving. Can take up to 20 seconds. Or skip this and fill them in by hand.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" data-testid="form-profile">
            <FormField
              control={form.control}
              name="resumeText"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Base Resume Text *</FormLabel>
                  <FormDescription>
                    Paste your full resume text here. This is the most important field for AI tailoring.
                  </FormDescription>
                  <FormControl>
                    <Textarea
                      placeholder="Paste your complete resume text here — work experience, education, skills, etc..."
                      rows={12}
                      data-testid="textarea-resume"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="careerSummary"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Career Summary / Bio</FormLabel>
                  <FormDescription>
                    A short paragraph describing your professional identity and goals.
                  </FormDescription>
                  <FormControl>
                    <Textarea
                      placeholder="A results-driven software engineer with 5 years of experience building..."
                      rows={4}
                      data-testid="textarea-career-summary"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="keySkills"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Key Skills</FormLabel>
                  <FormDescription>
                    List your top skills. The AI uses this to highlight relevant expertise for each role.
                  </FormDescription>
                  <FormControl>
                    <Textarea
                      placeholder="TypeScript, React, Node.js, PostgreSQL, AWS, System Design, Agile..."
                      rows={3}
                      data-testid="textarea-skills"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="pastRoles"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Past Roles & Key Achievements</FormLabel>
                  <FormDescription>
                    Summarize your past roles and most impactful accomplishments. The AI uses this to pull relevant experience into tailored bullets.
                  </FormDescription>
                  <FormControl>
                    <Textarea
                      placeholder="Senior Engineer at Acme (2021-2024): Led migration of monolith to microservices, reducing API latency by 40%. Built real-time analytics dashboard serving 500k users...&#10;&#10;Engineer at StartupXYZ (2019-2021): Built payment processing pipeline..."
                      rows={8}
                      data-testid="textarea-past-roles"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex items-center gap-3 pt-2">
              <Button type="submit" disabled={upsertProfile.isPending} data-testid="button-save-profile">
                {upsertProfile.isPending ? (
                  <><Loader2 size={14} className="mr-2 animate-spin" /> Saving...</>
                ) : (
                  <><Save size={14} className="mr-2" /> Save Profile</>
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
