"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  PenLine,
  ListChecks,
  Repeat,
  BarChart3,
  Settings,
  Sparkles,
  Headphones,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  matcher?: (pathname: string) => boolean;
};

const NAV_ITEMS: NavItem[] = [
  {
    href: "/library",
    label: "Library",
    icon: BookOpen,
    matcher: (p) => p === "/" || p.startsWith("/library") || p.startsWith("/documents"),
  },
  {
    href: "/practice",
    label: "Practice",
    icon: PenLine,
    matcher: (p) => p.startsWith("/practice"),
  },
  {
    href: "/quiz",
    label: "Quiz",
    icon: ListChecks,
    matcher: (p) => p.startsWith("/quiz"),
  },
  {
    href: "/tcf",
    label: "TCF",
    icon: Headphones,
    matcher: (p) => p.startsWith("/tcf"),
  },
  {
    href: "/conjugation",
    label: "Conjugation",
    icon: Repeat,
    matcher: (p) => p.startsWith("/conjugation"),
  },
  {
    href: "/progress",
    label: "Progress",
    icon: BarChart3,
    matcher: (p) => p.startsWith("/progress"),
  },
  {
    href: "/settings",
    label: "Settings",
    icon: Settings,
    matcher: (p) => p.startsWith("/settings"),
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex w-[200px] shrink-0 flex-col border-r border-border/60 bg-surface-muted/60 px-3 py-6">
      <Link
        href="/library"
        className="flex items-center gap-2 px-3 mb-8 group"
      >
        <Sparkles className="h-5 w-5 text-accent" strokeWidth={1.8} />
        <span className="font-serif text-2xl font-semibold tracking-tight text-foreground">
          Lumière
        </span>
      </Link>

      <nav className="flex flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = item.matcher
            ? item.matcher(pathname)
            : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-accent-soft text-accent"
                  : "text-muted-foreground hover:bg-surface hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" strokeWidth={1.8} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto px-3">
        <p className="text-[11px] uppercase tracking-wider text-subtle-foreground">
          v0.1 · self
        </p>
      </div>
    </aside>
  );
}
