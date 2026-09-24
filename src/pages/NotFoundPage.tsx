import { Link } from "react-router-dom";
import { Button } from "../components/ui/Button";

export function NotFoundPage() {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-4 px-6 py-24 text-center">
      <h1 className="font-display text-4xl font-semibold text-ink dark:text-ink-dark">Page not found</h1>
      <p className="text-ink-soft dark:text-ink-soft-dark">
        The page you're looking for doesn't exist, or the event may no longer be listed.
      </p>
      <Link to="/">
        <Button>Back to events</Button>
      </Link>
    </div>
  );
}
