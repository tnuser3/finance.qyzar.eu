import type * as React from "react";

import { cn } from "@/lib/utils";

function SectionLabel({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground",
        className
      )}
      {...props}
    />
  );
}

export { SectionLabel };
