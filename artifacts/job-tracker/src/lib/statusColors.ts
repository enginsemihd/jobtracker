export const STATUS_LIST = [
  "Saved",
  "Applied",
  "Interviewing",
  "Offer",
  "Rejected",
  "Withdrawn",
] as const;

export type Status = (typeof STATUS_LIST)[number];

export const STATUS_COLORS: Record<
  Status,
  { badge: string; column: string; dot: string }
> = {
  Saved: {
    badge: "bg-chip text-muted-foreground border border-border",
    column: "border-t-muted-foreground/40",
    dot: "bg-muted-foreground",
  },
  Applied: {
    badge: "bg-info-tint text-info border border-info/20",
    column: "border-t-info",
    dot: "bg-info",
  },
  Interviewing: {
    badge: "bg-ochre-tint text-ochre border border-ochre/20",
    column: "border-t-ochre",
    dot: "bg-ochre",
  },
  Offer: {
    badge: "bg-sage-tint text-sage border border-sage/20",
    column: "border-t-sage",
    dot: "bg-sage",
  },
  Rejected: {
    badge: "bg-destructive/10 text-destructive border border-destructive/20",
    column: "border-t-destructive",
    dot: "bg-destructive",
  },
  Withdrawn: {
    badge: "bg-chip text-muted-foreground border border-border",
    column: "border-t-muted-foreground/40",
    dot: "bg-muted-foreground",
  },
};
