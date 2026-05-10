"use client";

import { Brain } from "lucide-react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { GlobalSearch } from "@/components/layout/global-search";

export function TopBar() {
  return (
    <header className="sticky top-0 z-40 h-[68px] border-b border-border/70 bg-background/70 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60 flex items-center justify-between px-4 md:px-8">
      {/* Mobile brand */}
      <div className="flex items-center gap-2.5 md:hidden">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg gradient-brand shadow-sm">
          <Brain className="h-[18px] w-[18px] text-white" strokeWidth={2.25} />
        </div>
        <span className="text-[17px] font-semibold tracking-tight">LearnDaily</span>
      </div>

      <GlobalSearch />

      <div className="flex items-center gap-1.5">
        <ThemeToggle />
      </div>
    </header>
  );
}
