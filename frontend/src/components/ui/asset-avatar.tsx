"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export function AssetAvatar({
  symbol,
  src,
  className,
}: {
  symbol: string;
  src?: string | null;
  className?: string;
}) {
  return (
    <Avatar className={cn("size-5", className)}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <AvatarImage src={src} alt="" />
      ) : null}
      <AvatarFallback delayMs={src ? 600 : 0}>
        {symbol.slice(0, 1)}
      </AvatarFallback>
    </Avatar>
  );
}
