import { Link } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { PageBackdrop } from "../components/layout/PageBackdrop";

export function NotFoundPage() {
  return (
    <PageBackdrop>
      <div className="mx-auto flex max-w-lg flex-col items-center px-6 py-24 text-center">
        <div className="rounded-3xl border border-border-warm/70 bg-paper/90 p-8 shadow-lg shadow-ink/5 backdrop-blur-sm dark:border-border-dark/70 dark:bg-paper-dark/90">
          <h1 className="font-display text-4xl font-semibold text-ink dark:text-ink-dark">Page not found</h1>
          <p className="mt-4 text-ink-soft dark:text-ink-soft-dark">
            The page you're looking for doesn't exist, or the event may no longer be listed.
          </p>
          <Link to="/">
            <Button className="mt-6">Back to events</Button>
          </Link>
        </div>
      </div>
    </PageBackdrop>
  );
}
