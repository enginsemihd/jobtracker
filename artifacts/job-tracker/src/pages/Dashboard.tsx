import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  useListApplications,
  useGetDashboardStats,
  useGetOverdueFollowUps,
  useUpdateApplicationStatus,
  useDeleteApplication,
  getListApplicationsQueryKey,
  getGetDashboardStatsQueryKey,
  getGetOverdueFollowUpsQueryKey,
} from "@workspace/api-client-react";
import { Plus, LayoutGrid, List, AlertTriangle, Trash2, ExternalLink, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { isSafeUrl } from "@/lib/url";

type ViewMode = "kanban" | "list";

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-card border border-border rounded-lg p-4" data-testid={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">{label}</p>
      <p className="text-2xl font-bold text-foreground mt-1">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function AppCard({
  app,
  onDragStart,
  onDelete,
}: {
  app: {
    id: number;
    companyName: string;
    roleTitle: string;
    status: string;
    dateAdded: string;
    jobPostingUrl?: string | null;
    followUpDate?: string | null;
  };
  onDragStart: (e: React.DragEvent, id: number) => void;
  onDelete: (id: number) => void;
}) {
  const colors = STATUS_COLORS[app.status as Status] ?? STATUS_COLORS.Saved;
  const today = new Date().toISOString().split("T")[0];
  const isOverdue = app.followUpDate && app.followUpDate < today;

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, app.id)}
      className="bg-card border border-border rounded-lg p-3 cursor-grab active:cursor-grabbing hover:shadow-sm transition-shadow group"
      data-testid={`card-application-${app.id}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-foreground truncate">{app.companyName}</p>
          <p className="text-xs text-muted-foreground truncate mt-0.5">{app.roleTitle}</p>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {isSafeUrl(app.jobPostingUrl) && (
            <a href={app.jobPostingUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="icon" className="h-6 w-6" data-testid={`link-job-${app.id}`}>
                <ExternalLink size={12} />
              </Button>
            </a>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-destructive"
            onClick={(e) => { e.stopPropagation(); onDelete(app.id); }}
            data-testid={`button-delete-${app.id}`}
          >
            <Trash2 size={12} />
          </Button>
        </div>
      </div>
      <div className="flex items-center justify-between mt-2">
        <span className="text-xs text-muted-foreground">
          {new Date(app.dateAdded).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </span>
        {isOverdue && (
          <span className="flex items-center gap-1 text-xs text-amber-600">
            <AlertTriangle size={10} />
            Follow-up
          </span>
        )}
      </div>
      <Link href={`/applications/${app.id}`}>
        <button className="w-full text-left mt-2 text-xs text-primary hover:underline" data-testid={`link-detail-${app.id}`}>
          View details
        </button>
      </Link>
    </div>
  );
}

export default function Dashboard() {
  const [view, setView] = useState<ViewMode>("kanban");
  const [dragOverStatus, setDragOverStatus] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: applications, isLoading: appsLoading } = useListApplications();
  const { data: stats, isLoading: statsLoading } = useGetDashboardStats();
  const { data: overdueFollowUps } = useGetOverdueFollowUps();
  const updateStatus = useUpdateApplicationStatus();
  const deleteApp = useDeleteApplication();

  function handleDragStart(e: React.DragEvent, id: number) {
    e.dataTransfer.setData("applicationId", String(id));
  }

  function handleDrop(e: React.DragEvent, status: string) {
    e.preventDefault();
    setDragOverStatus(null);
    const id = parseInt(e.dataTransfer.getData("applicationId"), 10);
    if (!id) return;
    updateStatus.mutate(
      { id, data: { status: status as Status } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListApplicationsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() });
          toast({ title: "Status updated" });
        },
      }
    );
  }

  function handleDelete(id: number) {
    deleteApp.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListApplicationsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetOverdueFollowUpsQueryKey() });
          toast({ title: "Application deleted" });
          setDeleteId(null);
        },
      }
    );
  }

  const appsByStatus = STATUS_LIST.reduce(
    (acc, status) => {
      acc[status] = applications?.filter((a) => a.status === status) ?? [];
      return acc;
    },
    {} as Record<Status, typeof applications>
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-border px-6 py-4 flex items-center justify-between gap-4 bg-background">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Track your job search progress</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={view === "kanban" ? "default" : "outline"}
            size="sm"
            onClick={() => setView("kanban")}
            data-testid="button-kanban-view"
          >
            <LayoutGrid size={14} className="mr-1.5" /> Kanban
          </Button>
          <Button
            variant={view === "list" ? "default" : "outline"}
            size="sm"
            onClick={() => setView("list")}
            data-testid="button-list-view"
          >
            <List size={14} className="mr-1.5" /> List
          </Button>
          <Link href="/applications/new">
            <Button size="sm" data-testid="button-new-application">
              <Plus size={14} className="mr-1.5" /> New
            </Button>
          </Link>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {statsLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-lg" />
            ))
          ) : (
            <>
              <StatCard label="Total" value={stats?.total ?? 0} />
              <StatCard label="Applied This Week" value={stats?.appliedThisWeek ?? 0} />
              <StatCard label="Response Rate" value={`${stats?.responseRate ?? 0}%`} />
              <StatCard label="Overdue Follow-ups" value={stats?.overdueFollowUps ?? 0} />
            </>
          )}
        </div>

        {/* Overdue follow-ups banner */}
        {overdueFollowUps && overdueFollowUps.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4" data-testid="banner-follow-ups">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle size={16} className="text-amber-600" />
              <span className="text-sm font-semibold text-amber-800">Needs Follow-up</span>
            </div>
            <div className="space-y-1">
              {overdueFollowUps.map((app) => (
                <Link key={app.id} href={`/applications/${app.id}`}>
                  <div className="flex items-center justify-between text-sm text-amber-700 hover:text-amber-900 cursor-pointer py-0.5" data-testid={`follow-up-${app.id}`}>
                    <span>{app.companyName} — {app.roleTitle}</span>
                    <div className="flex items-center gap-1">
                      <span className="text-xs">{app.followUpDate}</span>
                      <ChevronRight size={12} />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Kanban Board */}
        {view === "kanban" && (
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3" data-testid="kanban-board">
            {STATUS_LIST.map((status) => {
              const colors = STATUS_COLORS[status];
              const cards = appsByStatus[status] ?? [];
              return (
                <div
                  key={status}
                  className={`bg-muted/40 rounded-lg border-t-2 ${colors.column} ${
                    dragOverStatus === status ? "ring-2 ring-primary/30" : ""
                  } transition-all`}
                  onDragOver={(e) => { e.preventDefault(); setDragOverStatus(status); }}
                  onDragLeave={() => setDragOverStatus(null)}
                  onDrop={(e) => handleDrop(e, status)}
                  data-testid={`column-${status.toLowerCase()}`}
                >
                  <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
                    <span className="text-xs font-semibold text-foreground">{status}</span>
                    <span className="text-xs font-medium text-muted-foreground bg-background rounded-full w-5 h-5 flex items-center justify-center">
                      {cards.length}
                    </span>
                  </div>
                  <div className="p-2 space-y-2 min-h-[80px]">
                    {appsLoading ? (
                      <Skeleton className="h-16 rounded-md" />
                    ) : cards.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-4 italic">Drop here</p>
                    ) : (
                      cards.map((app) => (
                        <AppCard
                          key={app.id}
                          app={app}
                          onDragStart={handleDragStart}
                          onDelete={(id) => setDeleteId(id)}
                        />
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* List View */}
        {view === "list" && (
          <div className="bg-card border border-border rounded-lg overflow-hidden" data-testid="list-view">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Company</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Role</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider hidden md:table-cell">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider hidden md:table-cell">Added</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider hidden lg:table-cell">Follow-up</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {appsLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i} className="border-b border-border">
                      <td colSpan={6} className="px-4 py-3">
                        <Skeleton className="h-5 w-full" />
                      </td>
                    </tr>
                  ))
                ) : !applications || applications.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center">
                      <p className="text-muted-foreground text-sm">No applications yet.</p>
                      <Link href="/applications/new">
                        <Button variant="link" size="sm" className="mt-2" data-testid="button-empty-new">
                          Add your first application
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ) : (
                  applications.map((app) => {
                    const colors = STATUS_COLORS[app.status as Status] ?? STATUS_COLORS.Saved;
                    const today = new Date().toISOString().split("T")[0];
                    const isOverdue = app.followUpDate && app.followUpDate < today;
                    return (
                      <tr
                        key={app.id}
                        className="border-b border-border hover:bg-muted/30 transition-colors"
                        data-testid={`row-application-${app.id}`}
                      >
                        <td className="px-4 py-3 font-medium text-foreground">{app.companyName}</td>
                        <td className="px-4 py-3 text-muted-foreground">{app.roleTitle}</td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${colors.badge}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
                            {app.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs hidden md:table-cell">
                          {new Date(app.dateAdded).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell">
                          {app.followUpDate ? (
                            <span className={`text-xs ${isOverdue ? "text-amber-600 font-medium" : "text-muted-foreground"}`}>
                              {isOverdue && <AlertTriangle size={10} className="inline mr-1" />}
                              {app.followUpDate}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 justify-end">
                            <Link href={`/applications/${app.id}`}>
                              <Button variant="ghost" size="sm" className="text-xs h-7" data-testid={`button-view-${app.id}`}>
                                View
                              </Button>
                            </Link>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              onClick={() => setDeleteId(app.id)}
                              data-testid={`button-list-delete-${app.id}`}
                            >
                              <Trash2 size={13} />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Empty state for kanban */}
        {view === "kanban" && !appsLoading && applications?.length === 0 && (
          <div className="text-center py-12" data-testid="empty-state">
            <p className="text-muted-foreground">No applications yet. Start tracking your job search.</p>
            <Link href="/applications/new">
              <Button className="mt-4" data-testid="button-empty-add">
                <Plus size={14} className="mr-2" /> Add Your First Application
              </Button>
            </Link>
          </div>
        )}
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete application?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this application and all associated AI-tailored content. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && handleDelete(deleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
