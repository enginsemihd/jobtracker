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
  jobPostingUrl: z.string().optional(),
  jobDescription: z.string().optional(),
  status: z.string().default("Saved"),
  source: z.string().default("Manual"),
  applicationMethod: z.string().optional(),
  notes: z.string().optional(),
  followUpDate: z.string().optional(),
  dateApplied: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

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
    <div className="max-w-2xl mx-auto px-6 py-6">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/">
          <Button variant="ghost" size="icon" className="h-8 w-8" data-testid="button-back">
            <ArrowLeft size={16} />
          </Button>
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-foreground">New Application</h1>
          <p className="text-sm text-muted-foreground">Track a new job opportunity</p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" data-testid="form-new-application">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="companyName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Company Name *</FormLabel>
                  <FormControl>
                    <Input placeholder="Acme Corp" data-testid="input-company-name" {...field} />
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
                  <FormLabel>Role Title *</FormLabel>
                  <FormControl>
                    <Input placeholder="Senior Engineer" data-testid="input-role-title" {...field} />
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
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-status">
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
                <FormLabel>Job Posting URL</FormLabel>
                <FormControl>
                  <Input placeholder="https://company.com/jobs/123" data-testid="input-job-url" {...field} />
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
                    placeholder="Paste the full job description here. This is used by the AI tailoring assistant to generate personalized resume bullets and cover letter content."
                    rows={8}
                    data-testid="textarea-job-description"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="applicationMethod"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Application Method</FormLabel>
                  <FormControl>
                    <Input placeholder="Company site, Referral, Email..." data-testid="input-method" {...field} />
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
            name="followUpDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Follow-up Reminder Date</FormLabel>
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
                    placeholder="Any additional notes — contacts, interview prep, context..."
                    rows={3}
                    data-testid="textarea-notes"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="flex items-center gap-3 pt-2">
            <Button type="submit" disabled={createApp.isPending} data-testid="button-submit">
              {createApp.isPending ? "Saving..." : "Save Application"}
            </Button>
            <Link href="/">
              <Button type="button" variant="outline" data-testid="button-cancel">
                Cancel
              </Button>
            </Link>
          </div>
        </form>
      </Form>
    </div>
  );
}
