import { Button } from "../ui/Button";

export function LoadMore({
  hasMore,
  loading,
  onClick,
  shown,
  total,
}: {
  hasMore: boolean;
  loading: boolean;
  onClick: () => void;
  shown: number;
  total: number;
}) {
  if (!hasMore && total > 0) {
    return (
      <p className="pt-4 text-center text-sm text-ink-faint">
        Showing all {total} event{total === 1 ? "" : "s"}
      </p>
    );
  }
  if (!hasMore) return null;

  return (
    <div className="flex flex-col items-center gap-2 pt-4">
      <Button variant="outline" onClick={onClick} disabled={loading}>
        {loading ? "Loading…" : "Load more events"}
      </Button>
      <p className="text-xs text-ink-faint">
        Showing {shown} of {total}
      </p>
    </div>
  );
}
