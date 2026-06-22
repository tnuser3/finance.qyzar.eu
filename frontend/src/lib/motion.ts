import { cn } from "@/lib/utils";

/** Fade/slide entrance for panels and cards. Respects reduced motion via motion-safe. */
export const motionEnter =
  "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-300";

/** Subtle hover lift for interactive cards. */
export const motionHover =
  "transition-all duration-200 hover:border-border/80 hover:shadow-md";

/** Staggered entrance delay for list children. */
export function motionStagger(index: number, baseMs = 50): string {
  return cn(
    motionEnter,
    `[animation-delay:${index * baseMs}ms] motion-reduce:animate-none motion-reduce:opacity-100`
  );
}

/** Entrance with custom delay (e.g. page sections). */
export function motionEnterDelay(delayMs: number): string {
  return cn(
    motionEnter,
    `[animation-delay:${delayMs}ms] motion-reduce:animate-none motion-reduce:opacity-100`
  );
}
