import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/link-button";
import { Clock, Target, Trophy, ArrowRight, History, Sparkles } from "lucide-react";
import { MOCK_INTERVIEW_CONFIG, CONVERSATIONAL_INTERVIEW_CONFIG } from "@/lib/types";
import { getRecentMockInterviews } from "@/lib/actions/mock-interviews";

export default async function MockInterviewPage() {
  const recentInterviews = await getRecentMockInterviews(5);

  const completedInterviews = recentInterviews.filter((i) => i.status === "completed");
  const avgScore = completedInterviews.length > 0
    ? Math.round(completedInterviews.reduce((sum, i) => sum + (i.score_percent || 0), 0) / completedInterviews.length)
    : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Mock Interview</h1>
        <p className="text-muted-foreground">
          Simulate real interview conditions with timed sessions.
        </p>
      </div>

      {/* Quick Stats */}
      {completedInterviews.length > 0 && (
        <div className="flex items-center gap-4 p-4 rounded-lg bg-accent/50 border border-border">
          <Trophy className="h-5 w-5 text-muted-foreground" />
          <div className="text-sm">
            <span className="font-medium">{completedInterviews.length} sessions</span> completed &middot;{" "}
            <span className="font-medium">{avgScore}%</span> avg score
          </div>
        </div>
      )}

      {/* Conversational (AI-driven) — Phase 2 */}
      <Card className="border-primary/40 bg-gradient-to-br from-primary/5 to-transparent">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <CardTitle className="text-lg">AI Conversational Interview</CardTitle>
            </div>
            <Badge variant="secondary" className="text-xs">New</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            A real AI interviewer drives the session — asks the questions,
            probes follow-ups, and writes a Staff+ report at the end. Voice
            in/out optional. DSA mode includes a code editor with live tests.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {(["dsa", "system_design"] as const).map((modeKey) => {
              const cfg = CONVERSATIONAL_INTERVIEW_CONFIG[modeKey];
              return (
                <div
                  key={modeKey}
                  className="rounded-lg border border-border bg-background/60 p-3 flex flex-col gap-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">{cfg.label}</div>
                    {cfg.codeEditor && (
                      <Badge variant="secondary" className="text-[10px]">
                        Editor
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground flex-1">
                    {cfg.description}
                  </p>
                  <LinkButton
                    href={`/mock-interview/conversation?mode=${modeKey}`}
                    size="sm"
                  >
                    Start
                    <ArrowRight className="ml-1 h-4 w-4" />
                  </LinkButton>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Mode Selection */}
      <div className="grid gap-4 md:grid-cols-2">
        {Object.entries(MOCK_INTERVIEW_CONFIG).map(([mode, config]) => (
          <Card key={mode} className="group hover:bg-accent/50 transition-colors">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{config.label}</CardTitle>
                <Badge variant="secondary" className="text-xs">
                  <Clock className="h-3 w-3 mr-1" />
                  {config.timeMinutes} min
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {config.description}
              </p>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Target className="h-3 w-3" />
                  {config.questionCount} questions
                </div>
                <LinkButton
                  href={`/mock-interview/session?mode=${mode}`}
                  size="sm"
                >
                  Start
                  <ArrowRight className="ml-1 h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
                </LinkButton>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent Sessions */}
      {recentInterviews.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <History className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-lg">Recent Sessions</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentInterviews.map((interview) => (
                <div
                  key={interview.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-accent/30"
                >
                  <div>
                    <p className="text-sm font-medium capitalize">
                      {MOCK_INTERVIEW_CONFIG[interview.mode as keyof typeof MOCK_INTERVIEW_CONFIG]?.label ?? interview.mode}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(interview.started_at).toLocaleDateString()} &middot;{" "}
                      {interview.questions_answered}/{interview.total_questions} answered
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {interview.status === "completed" && (
                      <Badge
                        variant="secondary"
                        className={
                          (interview.score_percent || 0) >= 70
                            ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                            : "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200"
                        }
                      >
                        {interview.score_percent}%
                      </Badge>
                    )}
                    {interview.status === "abandoned" && (
                      <Badge variant="secondary" className="text-xs">Abandoned</Badge>
                    )}
                    {interview.status === "in_progress" && (
                      <LinkButton
                        href={
                          interview.conversation_mode
                            ? `/mock-interview/conversation?mode=${interview.mode}&resume=${interview.id}`
                            : `/mock-interview/session?resume=${interview.id}`
                        }
                        size="sm"
                        variant="outline"
                      >
                        Resume
                      </LinkButton>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
