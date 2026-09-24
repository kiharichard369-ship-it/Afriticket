import { cn } from "../../lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-lg bg-ink/8 dark:bg-white/10 motion-reduce:animate-none",
        className
      )}
      aria-hidden="true"
    />
  );
}

export function EventCardSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border-warm dark:border-border-dark">
      <Skeleton className="h-40 w-full rounded-none" />
      <div className="space-y-2 p-4">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-3 w-1/3" />
      </div>
    </div>
  );
}
