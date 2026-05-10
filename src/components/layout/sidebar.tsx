"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  BookOpen,
  RotateCcw,
  BarChart3,
  Brain,
  Settings,
  Swords,
  Building2,
  Notebook,
  Sparkles,
  Network,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  group: "main" | "practice" | "insights";
};

const navItems: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, group: "main" },
  { href: "/notes", label: "Notes", icon: Notebook, group: "main" },
  { href: "/entries", label: "Entries", icon: BookOpen, group: "main" },

  { href: "/revise", label: "Revise", icon: RotateCcw, group: "practice" },
  { href: "/mock-interview", label: "Mock Interview", icon: Swords, group: "practice" },
  { href: "/design-review", label: "Design Review", icon: Network, group: "practice" },
  { href: "/interviews", label: "Interviews", icon: Building2, group: "practice" },

  { href: "/gaps", label: "Gaps", icon: Sparkles, group: "insights" },
  { href: "/stats", label: "Stats", icon: BarChart3, group: "insights" },
  { href: "/settings", label: "Settings", icon: Settings, group: "insights" },
];

const groupLabels: Record<NavItem["group"], string> = {
  main: "Workspace",
  practice: "Practice",
  insights: "Insights",
};

export function Sidebar() {
  const pathname = usePathname();

  const groups = (["main", "practice", "insights"] as const).map((g) => ({
    key: g,
    label: groupLabels[g],
    items: navItems.filter((i) => i.group === g),
  }));

  return (
    <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 border-r border-sidebar-border bg-sidebar/95 backdrop-blur-xl z-30">
      {/* Brand */}
      <div className="flex h-[68px] items-center gap-3 px-5 border-b border-sidebar-border">
        <div className="relative flex h-10 w-10 items-center justify-center rounded-xl gradient-brand shadow-md shadow-primary/20">
          <Brain className="h-[22px] w-[22px] text-white" strokeWidth={2.25} />
          <div className="absolute inset-0 rounded-xl ring-1 ring-inset ring-white/20" />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-[17px] font-semibold tracking-tight text-sidebar-foreground">
            LearnDaily
          </span>
          <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
            Engineering OS
          </span>
        </div>
      </div>

      {/* Nav groups */}
      <nav className="flex-1 overflow-y-auto px-3 py-5 space-y-6">
        {groups.map((group) => (
          <div key={group.key} className="space-y-1">
            <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
              {group.label}
            </div>
            {group.items.map((item) => {
              const isActive =
                pathname === item.href ||
                (item.href !== "/" && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-[14px] font-medium transition-all duration-200",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-xs"
                      : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                  )}
                >
                  {isActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-primary" />
                  )}
                  <item.icon
                    className={cn(
                      "h-[19px] w-[19px] shrink-0 transition-colors",
                      isActive
                        ? "text-primary"
                        : "text-muted-foreground/80 group-hover:text-foreground"
                    )}
                    strokeWidth={isActive ? 2.25 : 2}
                  />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer hint */}
      <div className="border-t border-sidebar-border px-5 py-3.5">
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          <span className="font-medium text-sidebar-foreground">Pro tip · </span>
          Press <kbd className="mx-0.5 rounded border border-border bg-muted px-1.5 py-0.5 text-[11px] font-mono">⌘K</kbd>
          for quick search.
        </p>
      </div>
    </aside>
  );
}
