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
    badge: "bg-slate-100 text-slate-700 border border-slate-200",
    column: "border-t-slate-400",
    dot: "bg-slate-400",
  },
  Applied: {
    badge: "bg-blue-100 text-blue-700 border border-blue-200",
    column: "border-t-blue-500",
    dot: "bg-blue-500",
  },
  Interviewing: {
    badge: "bg-amber-100 text-amber-700 border border-amber-200",
    column: "border-t-amber-500",
    dot: "bg-amber-500",
  },
  Offer: {
    badge: "bg-green-100 text-green-700 border border-green-200",
    column: "border-t-green-500",
    dot: "bg-green-500",
  },
  Rejected: {
    badge: "bg-rose-100 text-rose-700 border border-rose-200",
    column: "border-t-rose-500",
    dot: "bg-rose-500",
  },
  Withdrawn: {
    badge: "bg-gray-100 text-gray-600 border border-gray-200",
    column: "border-t-gray-400",
    dot: "bg-gray-400",
  },
};
