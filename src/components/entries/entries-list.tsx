"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { LinkButton } from "@/components/ui/link-button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Search } from "lucide-react";
import { CATEGORY_CONFIG, type Entry } from "@/lib/types";

const difficultyColors: Record<string, string> = {
  easy: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  medium: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  hard: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

export function EntriesList({ entries }: { entries: Entry[] }) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const filteredEntries = entries.filter((entry) => {
    const matchesSearch =
      entry.title.toLowerCase().includes(search.toLowerCase()) ||
      entry.tags.some((tag) => tag.toLowerCase().includes(search.toLowerCase())) ||
      (entry.subcategory?.toLowerCase().includes(search.toLowerCase()) ?? false);
    const matchesCategory =
      categoryFilter === "all" || entry.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Library · {entries.length} {entries.length === 1 ? "entry" : "entries"}
          </p>
          <h1 className="text-[30px] md:text-[36px] font-semibold tracking-tight leading-tight">
            Entries
          </h1>
          <p className="text-[15px] text-muted-foreground">
            All your learning notes in one place.
          </p>
        </div>
        <LinkButton href="/entries/new" size="lg">
          <Plus className="mr-1.5 h-4 w-4" />
          New Entry
        </LinkButton>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search entries, tags, or subcategory..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v ?? "all")}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {Object.entries(CATEGORY_CONFIG).map(([key, config]) => (
              <SelectItem key={key} value={key}>
                {config.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Entries List */}
      <div className="space-y-3">
        {filteredEntries.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">
                {entries.length === 0
                  ? "No entries yet. Start by adding your first learning entry!"
                  : "No entries found. Try a different search or filter."}
              </p>
              {entries.length === 0 && (
                <LinkButton href="/entries/new" className="mt-4">
                  <Plus className="mr-2 h-4 w-4" />
                  Add First Entry
                </LinkButton>
              )}
            </CardContent>
          </Card>
        ) : (
          filteredEntries.map((entry) => {
            const catConfig = CATEGORY_CONFIG[entry.category] ?? { label: entry.category, color: "" };
            return (
              <Link key={entry.id} href={`/entries/${entry.id}`}>
                <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
                  <CardContent className="py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <h3 className="font-medium text-[15px] md:text-base truncate">
                          {entry.title}
                        </h3>
                        <div className="flex flex-wrap items-center gap-2 mt-2.5">
                          <Badge variant="secondary" className={catConfig.color}>
                            {catConfig.label}
                          </Badge>
                          {entry.subcategory && (
                            <Badge variant="secondary">
                              {entry.subcategory}
                            </Badge>
                          )}
                          <Badge
                            variant="secondary"
                            className={difficultyColors[entry.difficulty]}
                          >
                            {entry.difficulty}
                          </Badge>
                          {entry.tags.slice(0, 3).map((tag) => (
                            <Badge key={tag} variant="outline">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <span className="text-[13px] text-muted-foreground whitespace-nowrap">
                        {new Date(entry.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
