import { cn } from "@/lib/utils";

export function Badge({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        className
      )}
      {...props}
    />
  );
}

const statusColors: Record<string, string> = {
  pass: "bg-emerald-500/15 text-emerald-400",
  fail: "bg-red-500/15 text-red-400",
  uncertain: "bg-amber-500/15 text-amber-400",
  not_testable: "bg-zinc-500/15 text-zinc-400",
  human_review: "bg-sky-500/15 text-sky-400",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge className={statusColors[status] ?? "bg-zinc-500/15 text-zinc-400"}>
      {status.replace("_", " ")}
    </Badge>
  );
}
