import type { ReactNode } from "react";
import { Button } from "./Button";

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  icon,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: ReactNode;
}) {
  return (
    <div
      role="status"
      className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border-warm px-6 py-16 text-center dark:border-border-dark"
    >
      {icon}
      <h3 className="font-display text-xl text-ink dark:text-ink-dark">{title}</h3>
      <p className="max-w-sm text-sm text-ink-soft dark:text-ink-soft-dark">{description}</p>
      {actionLabel && onAction && (
        <Button variant="outline" size="sm" onClick={onAction} className="mt-2">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

export function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-xl border border-rust/30 bg-rust/5 px-6 py-16 text-center"
    >
      <h3 className="font-display text-xl text-rust">Couldn't load events</h3>
      <p className="max-w-sm text-sm text-ink-soft dark:text-ink-soft-dark">
        Something went wrong while talking to the catalog. Check your connection and try again.
      </p>
      <Button variant="outline" size="sm" onClick={onRetry} className="mt-2">
        Try again
      </Button>
    </div>
  );
}
