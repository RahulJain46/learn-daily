"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, BookOpen, RotateCcw, Notebook, Swords } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Home", icon: LayoutDashboard },
  { href: "/notes", label: "Notes", icon: Notebook },
  { href: "/entries", label: "Entries", icon: BookOpen },
  { href: "/revise", label: "Revise", icon: RotateCcw },
  { href: "/mock-interview", label: "Mock", icon: Swords },
];

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 border-t border-border bg-background/85 backdrop-blur-xl supports-[backdrop-filter]:bg-background/70 z-50 pb-[max(0px,env(safe-area-inset-bottom))]">
      <div className="grid grid-cols-5 h-[68px]">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "relative flex flex-col items-center justify-center gap-1.5 text-[12px] font-medium transition-colors",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {isActive && (
                <span className="absolute top-1.5 h-1 w-1 rounded-full bg-primary" />
              )}
              <item.icon
                className={cn(
                  "h-[22px] w-[22px] transition-transform",
                  isActive ? "scale-110" : "scale-100"
                )}
                strokeWidth={isActive ? 2.25 : 2}
              />
              <span className="tracking-tight">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
