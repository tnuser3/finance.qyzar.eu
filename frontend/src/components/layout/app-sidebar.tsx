"use client";

import type { ComponentType } from "react";
import { Bitcoin, LineChart, Settings } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const navItems = [
  { href: "/market", label: "Market", icon: LineChart },
  { href: "/crypto", label: "Crypto", icon: Bitcoin },
] as const;

function NavItem({
  href,
  label,
  icon: Icon,
  active,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  active: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
        active
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
      )}
      aria-current={active ? "page" : undefined}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      {label}
    </Link>
  );
}

export default function AppSidebar({
  className,
  id,
  onNavigate,
}: {
  className?: string;
  id?: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <aside
      id={id}
      className={cn(
        "flex h-full shrink-0 flex-col border-r border-border bg-card",
        className
      )}
    >
      <div className="hidden shrink-0 items-center gap-3 border-b border-border px-5 py-6 md:flex">
        <div className="relative size-9 shrink-0">
          <Image
            src="/full_black@2x.png"
            alt=""
            width={36}
            height={36}
            className="logo-light size-9 object-contain"
            priority
          />
          <Image
            src="/full_white@2x.png"
            alt=""
            width={36}
            height={36}
            className="logo-dark size-9 object-contain"
            priority
          />
        </div>
        <div className="min-w-0 leading-tight">
          <p className="truncate text-base font-semibold tracking-tight">Qyzar</p>
          <p className="truncate text-sm text-muted-foreground">financials</p>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-4 py-5 md:py-4" aria-label="Main">
        {navItems.map(({ href, label, icon }) => (
          <NavItem
            key={href}
            href={href}
            label={label}
            icon={icon}
            onNavigate={onNavigate}
            active={pathname === href || (href === "/market" && pathname === "/")}
          />
        ))}
      </nav>

      <div className="mt-auto shrink-0 border-t border-border p-4">
        <NavItem
          href="/preferences"
          label="Preferences"
          icon={Settings}
          onNavigate={onNavigate}
          active={pathname === "/preferences"}
        />
      </div>
    </aside>
  );
}
