import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCreateApplication, getListApplicationsQueryKey, getGetDashboardStatsQueryKey, type ApplicationInputStatus } from "@workspace/api-client-react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { STATUS_LIST } from "@/lib/statusColors";

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
  jobPostingUrl: z.string().refine((v) => v === "" || /^https?:\/\//i.test(v), "Must be an http(s) URL").optional(),
  jobDescription: z.string().optional(),
  status: z.string().default("Saved"),
  source: z.string().default("Manual"),
  applicationMethod: z.string().optional(),
  notes: z.string().optional(),
  followUpDate: z.string().optional(),
  dateApplied: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

function SectionCard({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-[14px] p-5 shadow-card">
      <h2 className="text-[14.5px] font-bold text-foreground mb-3.5">{title}</h2>
      <div className="flex flex-col gap-3.5">{children}</div>
    </div>
  );
}

export default function ApplicationNew() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const createApp = useCreateApplication();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      companyName: "",
      roleTitle: "",
      country: "",
      jobPostingUrl: "",
      jobDescription: "",
      status: "Saved",
      source: "Manual",
      applicationMethod: "",
      notes: "",
      followUpDate: "",
      dateApplied: "",
    },
  });

  function onSubmit(values: FormValues) {
    const data = {
      companyName: values.companyName,
      roleTitle: values.roleTitle,
      ...(values.country && { country: values.country }),
      ...(values.jobPostingUrl && { jobPostingUrl: values.jobPostingUrl }),
      ...(values.jobDescription && { jobDescription: values.jobDescription }),
      status: values.status as ApplicationInputStatus,
      source: values.source,
      ...(values.applicationMethod && { applicationMethod: values.applicationMethod }),
      ...(values.notes && { notes: values.notes }),
      ...(values.followUpDate && { followUpDate: values.followUpDate }),
      ...(values.dateApplied && { dateApplied: values.dateApplied }),
    };

    createApp.mutate(
      { data },
      {
        onSuccess: (app) => {
          queryClient.invalidateQueries({ queryKey: getListApplicationsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() });
          toast({ title: "Application added" });
          setLocation(`/applications/${app.id}`);
        },
        onError: () => {
          toast({ title: "Failed to create application", variant: "destructive" });
        },
      }
    );
  }

  return (
    <div className="max-w-[680px] mx-auto px-8 py-7 animate-rise">
      <div className="flex items-center gap-3 mb-5">
        <Link href="/">
          <Button variant="ghost" size="icon" className="h-8 w-8" data-testid="button-back">
            <ArrowLeft size={16} />
          </Button>
        </Link>
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Track a new application</h1>
          <p className="text-sm text-muted-foreground">Every application you log is progress — even the long shots.</p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4" data-testid="form-new-application">
          <SectionCard title="The basics">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              <FormField
                control={form.control}
                name="companyName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold text-muted-foreground">Company Name *</FormLabel>
                    <FormControl>
                      <Input placeholder="Acme Corp" data-testid="input-company-name" className="h-10 rounded-[9px] bg-background" {...field} />
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
                    <FormLabel className="text-xs font-semibold text-muted-foreground">Role Title *</FormLabel>
                    <FormControl>
                      <Input placeholder="Senior Engineer" data-testid="input-role-title" className="h-10 rounded-[9px] bg-background" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              <FormField
                control={form.control}
                name="country"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold text-muted-foreground">Country / Location</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-country" className="h-10 rounded-[9px] bg-background">
                          <SelectValue placeholder="Select country..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
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
                    <FormLabel className="text-xs font-semibold text-muted-foreground">Stage</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-status" className="h-10 rounded-[9px] bg-background">
                          <SelectValue placeholder="Select status" />
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

            <FormField
              control={form.control}
              name="jobPostingUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-semibold text-muted-foreground">Job Posting URL</FormLabel>
                  <FormControl>
                    <Input placeholder="https://company.com/jobs/123" data-testid="input-job-url" className="h-10 rounded-[9px] bg-background" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </SectionCard>

          <SectionCard
            title={
              <span className="flex items-center gap-2">
                For the AI tailor
                <span className="text-[11px] font-semibold text-ember bg-ember-tint px-2 py-0.5 rounded-full">recommended</span>
              </span>
            }
          >
            <p className="text-xs text-muted-foreground -mt-1">
              Paste the job description now and Tailor Studio can write your materials the moment you need them.
            </p>
            <FormField
              control={form.control}
              name="jobDescription"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Textarea
                      placeholder="Paste the full job description here. This is used by the AI tailoring assistant to generate personalized resume bullets and cover letter content."
                      rows={6}
                      data-testid="textarea-job-description"
                      className="rounded-[9px] bg-background leading-relaxed"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </SectionCard>

          <SectionCard title="Stay on top of it">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              <FormField
                control={form.control}
                name="applicationMethod"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold text-muted-foreground">Application Method</FormLabel>
                    <FormControl>
                      <Input placeholder="Company site, Referral, Email..." data-testid="input-method" className="h-10 rounded-[9px] bg-background" {...field} />
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
                    <FormLabel className="text-xs font-semibold text-muted-foreground">Date Applied</FormLabel>
                    <FormControl>
                      <Input type="date" data-testid="input-date-applied" className="h-10 rounded-[9px] bg-background" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="followUpDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-semibold text-muted-foreground">Follow-up Reminder Date</FormLabel>
                  <FormControl>
                    <Input type="date" data-testid="input-follow-up-date" className="h-10 rounded-[9px] bg-background" {...field} />
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
                      placeholder="Any additional notes — contacts, interview prep, context..."
                      rows={3}
                      data-testid="textarea-notes"
                      className="rounded-[9px] bg-background leading-relaxed"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </SectionCard>

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={createApp.isPending} className="h-[42px] rounded-[11px] font-bold px-5" data-testid="button-submit">
              {createApp.isPending ? "Saving..." : "Save application"}
            </Button>
            <Link href="/">
              <Button type="button" variant="outline" className="h-[42px] rounded-[11px]" data-testid="button-cancel">
                Cancel
              </Button>
            </Link>
          </div>
        </form>
      </Form>
    </div>
  );
}
