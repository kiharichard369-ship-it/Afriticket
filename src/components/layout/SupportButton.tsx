import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { Dialog } from "../ui/Dialog";
import { Button } from "../ui/Button";

export function SupportButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Get help"
        className="fixed bottom-5 right-5 z-20 flex h-13 w-13 items-center justify-center rounded-full bg-sage text-paper shadow-lg hover:bg-sage/90"
      >
        <MessageCircle className="h-6 w-6" />
      </button>
      <Dialog open={open} onOpenChange={setOpen} title="Need a hand?" description="Support is being wired up for launch.">
        <p className="text-sm text-ink-soft dark:text-ink-soft-dark">
          Live chat and WhatsApp support will connect here once payments and ticket delivery go live in
          a later build. For now, reach the team directly:
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <Button variant="outline" size="sm" className="justify-start" onClick={() => (window.location.href = "mailto:afriticket@gmail.com")}>
            Email afriticket@gmail.com
          </Button>
          <Button variant="outline" size="sm" className="justify-start" onClick={() => (window.location.href = "tel:0115577319")}>
            Call 0115 577 319
          </Button>
        </div>
      </Dialog>
    </>
  );
}
