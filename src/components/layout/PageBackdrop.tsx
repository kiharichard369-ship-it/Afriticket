import type { ReactNode } from "react";

interface PageBackdropProps {
  children: ReactNode;
  image?: string;
}

export function PageBackdrop({ children, image = "/backgrounds/afriticket-events.jpg" }: PageBackdropProps) {
  return (
    <div className="relative isolate overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-cover bg-center bg-no-repeat opacity-20 dark:opacity-25"
        style={{ backgroundImage: `url("${image}")` }}
      />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-paper/80 dark:bg-paper-dark/85" />
      <div className="relative">{children}</div>
    </div>
  );
}
