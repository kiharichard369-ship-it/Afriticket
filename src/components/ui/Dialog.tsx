import * as RadixDialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  side?: "center" | "right";
}

export function Dialog({ open, onOpenChange, title, description, children, side = "center" }: DialogProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay
          className={cn(
            "fixed inset-0 z-40 bg-ink/40 backdrop-blur-[1px]",
            "data-[state=open]:animate-in data-[state=open]:fade-in data-[state=closed]:animate-out data-[state=closed]:fade-out",
            "motion-reduce:animate-none"
          )}
        />
        <RadixDialog.Content
          className={cn(
            "fixed z-50 flex flex-col bg-paper dark:bg-paper-dark focus:outline-none",
            side === "center"
              ? "left-1/2 top-1/2 w-[min(92vw,32rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border-warm p-6 dark:border-border-dark"
              : "right-0 top-0 h-full w-[min(90vw,22rem)] border-l border-border-warm p-6 dark:border-border-dark"
          )}
        >
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <RadixDialog.Title className="font-display text-xl text-ink dark:text-ink-dark">
                {title}
              </RadixDialog.Title>
              {description && (
                <RadixDialog.Description className="mt-1 text-sm text-ink-soft dark:text-ink-soft-dark">
                  {description}
                </RadixDialog.Description>
              )}
            </div>
            <RadixDialog.Close
              aria-label="Close"
              className="rounded-md p-1.5 text-ink-soft hover:bg-ink/5 dark:text-ink-soft-dark dark:hover:bg-white/10"
            >
              <X className="h-5 w-5" />
            </RadixDialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
