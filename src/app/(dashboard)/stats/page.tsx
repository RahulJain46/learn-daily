import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Flame, Target, TrendingUp, BookOpen, Calendar } from "lucide-react";
import { getStats } from "@/lib/actions/sessions";
import { getEntries } from "@/lib/actions/entries";
import { CATEGORY_CONFIG } from "@/lib/types";

export default async function StatsPage() {
  const [stats, entries] = await Promise.all([getStats(), getEntries()]);

  const total = entries.length || 1;
  const categoryCounts = Object.entries(CATEGORY_CONFIG).map(([key, config]) => ({
    key,
    label: config.label,
    count: entries.filter((e) => e.category === key).length,
  })).filter((c) => c.count > 0);

  const streak = stats?.streak ?? 0;
  const totalCards = stats?.totalCards ?? 0;
  const accuracy = stats?.accuracy ?? 0;
  const totalEntries = stats?.totalEntries ?? 0;
  const reviewedThisWeek = stats?.reviewedThisWeek ?? 0;
  const correctThisWeek = stats?.correctThisWeek ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Statistics</h1>
        <p className="text-muted-foreground">
          Track your learning progress over time.
        </p>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <Flame className="h-8 w-8 mx-auto text-orange-500 mb-2" />
            <p className="text-3xl font-bold">{streak}</p>
            <p className="text-xs text-muted-foreground">Day Streak</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <Target className="h-8 w-8 mx-auto text-blue-500 mb-2" />
            <p className="text-3xl font-bold">{totalCards}</p>
            <p className="text-xs text-muted-foreground">Total Cards</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <TrendingUp className="h-8 w-8 mx-auto text-green-500 mb-2" />
            <p className="text-3xl font-bold">{accuracy}%</p>
            <p className="text-xs text-muted-foreground">Accuracy</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <BookOpen className="h-8 w-8 mx-auto text-purple-500 mb-2" />
            <p className="text-3xl font-bold">{totalEntries}</p>
            <p className="text-xs text-muted-foreground">Total Entries</p>
          </CardContent>
        </Card>
      </div>

      {/* Category Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Category Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            {categoryCounts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No entries yet.</p>
            ) : (
              categoryCounts.map((cat) => (
                <div key={cat.key}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium">{cat.label}</span>
                    <span className="text-muted-foreground">
                      {cat.count} entries ({Math.round((cat.count / total) * 100)}%)
                    </span>
                  </div>
                  <Progress value={(cat.count / total) * 100} className="h-3" />
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Weekly Activity */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">This Week</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-4 rounded-lg bg-accent">
              <p className="text-2xl font-bold">{reviewedThisWeek}</p>
              <p className="text-xs text-muted-foreground">Cards Reviewed</p>
            </div>
            <div className="text-center p-4 rounded-lg bg-accent">
              <p className="text-2xl font-bold">{correctThisWeek}</p>
              <p className="text-xs text-muted-foreground">Correct</p>
            </div>
            <div className="text-center p-4 rounded-lg bg-accent">
              <p className="text-2xl font-bold">{accuracy}%</p>
              <p className="text-xs text-muted-foreground">Accuracy</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {entries.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">
              Start adding entries and doing revisions to see your stats here!
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
