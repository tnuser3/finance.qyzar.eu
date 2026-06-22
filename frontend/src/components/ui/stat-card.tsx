import type * as React from "react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface StatCardProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  value: number;
  tone?: "default" | "success" | "warning" | "danger" | "muted";
}

function StatCard({
  label,
  value,
  tone = "default",
  className,
  ...props
}: StatCardProps) {
  const toneClass =
    tone === "success"
      ? "text-success"
      : tone === "warning"
        ? "text-warning"
        : tone === "danger"
          ? "text-destructive"
          : tone === "muted"
            ? "text-muted-foreground"
            : "text-foreground";

  return (
    <Card
      className={cn(
        "rounded-lg border-border/80 bg-muted/30 p-4 shadow-none",
        className
      )}
      {...props}
    >
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-2 text-2xl font-semibold tracking-tight tabular-nums",
          toneClass
        )}
      >
        {value}
      </p>
    </Card>
  );
}

export { StatCard };
