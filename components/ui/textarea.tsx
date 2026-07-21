import * as React from "react";

import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex min-h-40 w-full rounded-2xl border border-hairline bg-card px-5 py-4 text-base leading-7 text-body shadow-[0_1px_2px_rgba(33,29,24,0.03)] transition-colors placeholder:text-muted/70 outline-none resize-y focus-visible:border-ink/30 focus-visible:ring-4 focus-visible:ring-ink/[0.06] disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}

export { Textarea };
