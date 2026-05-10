"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Bell,
  BellOff,
  Clock,
  Sparkles,
  CheckCircle2,
  Calendar,
  Layers,
  Flame,
} from "lucide-react";
import {
  isNotificationSupported,
  getNotificationPermission,
  requestNotificationPermission,
  isNotificationsEnabled,
  setNotificationsEnabled,
  startNotificationScheduler,
  stopNotificationScheduler,
  registerServiceWorker,
  getNotificationPrefs,
  setNotificationPrefs,
  testNotification,
  type NotificationKind,
  type NotificationPrefs,
} from "@/lib/notifications";

const FREQUENCY_KEY = "popup-quiz-frequency";

const FREQUENCY_OPTIONS = [
  { value: "900000", label: "Every 15 minutes" },
  { value: "1800000", label: "Every 30 minutes" },
  { value: "3600000", label: "Every 1 hour" },
  { value: "7200000", label: "Every 2 hours" },
];

const DEFAULT_PREFS: NotificationPrefs = {
  dailyQuizEnabled: true,
  dueCardsEnabled: true,
  streakSaveEnabled: true,
  dailyQuizTime: "09:00",
  streakSaveTime: "21:00",
};

export function QuizSettings() {
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [notifPermission, setNotifPermission] = useState<string>("default");
  const [frequency, setFrequency] = useState("1800000");
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setNotifEnabled(isNotificationsEnabled());
    setNotifPermission(getNotificationPermission());
    setPrefs(getNotificationPrefs());
    const stored = localStorage.getItem(FREQUENCY_KEY);
    if (stored) setFrequency(stored);
  }, []);

  const handleToggleNotifications = async () => {
    if (!notifEnabled) {
      await registerServiceWorker();
      if (getNotificationPermission() !== "granted") {
        const granted = await requestNotificationPermission();
        setNotifPermission(granted ? "granted" : "denied");
        if (!granted) return;
      }
      setNotificationsEnabled(true);
      setNotifEnabled(true);
      startNotificationScheduler();
    } else {
      setNotificationsEnabled(false);
      setNotifEnabled(false);
      stopNotificationScheduler();
    }
    showSaved();
  };

  const handleFrequencyChange = (value: string) => {
    setFrequency(value);
    localStorage.setItem(FREQUENCY_KEY, value);
    if (notifEnabled) {
      stopNotificationScheduler();
      startNotificationScheduler();
    }
    showSaved();
  };

  const updatePrefs = (patch: Partial<NotificationPrefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    setNotificationPrefs(patch);
    if (notifEnabled) {
      stopNotificationScheduler();
      startNotificationScheduler();
    }
    showSaved();
  };

  const handleTest = async (kind: NotificationKind) => {
    if (getNotificationPermission() !== "granted") {
      await registerServiceWorker();
      const granted = await requestNotificationPermission();
      if (!granted) return;
    }
    await testNotification(kind);
  };

  const showSaved = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const remindersDisabled = !notifEnabled || notifPermission !== "granted";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Quiz & Reminders</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* In-app pop quiz frequency */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <label className="text-sm font-medium">Popup Quiz Frequency</label>
          </div>
          <p className="text-xs text-muted-foreground">
            How often the floating quiz appears while you&apos;re using the app.
          </p>
          <Select
            value={frequency}
            onValueChange={(v) => handleFrequencyChange(v ?? "1800000")}
          >
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FREQUENCY_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Separator />

        {/* Master toggle */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-muted-foreground" />
            <label className="text-sm font-medium">Browser Notifications</label>
          </div>
          <p className="text-xs text-muted-foreground">
            Master switch for reminders that arrive even when the tab is in the
            background.
          </p>
          <div className="flex items-center gap-3">
            <Button
              variant={notifEnabled ? "default" : "outline"}
              size="sm"
              onClick={handleToggleNotifications}
              disabled={
                !isNotificationSupported() || notifPermission === "denied"
              }
            >
              {notifEnabled ? (
                <>
                  <Bell className="h-4 w-4 mr-2" />
                  Enabled
                </>
              ) : (
                <>
                  <BellOff className="h-4 w-4 mr-2" />
                  Disabled
                </>
              )}
            </Button>
            {notifPermission === "denied" && (
              <Badge variant="destructive" className="text-xs">
                Blocked by browser
              </Badge>
            )}
            {!isNotificationSupported() && (
              <Badge variant="secondary" className="text-xs">
                Not supported
              </Badge>
            )}
          </div>
        </div>

        {/* Per-kind reminder controls */}
        <div className="space-y-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
            Reminder types
          </p>

          {/* Daily quiz */}
          <div
            className={`rounded-lg border p-3 space-y-3 ${remindersDisabled ? "opacity-60" : ""}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex gap-2">
                <Calendar className="h-4 w-4 mt-0.5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Daily quiz</p>
                  <p className="text-xs text-muted-foreground">
                    One question, every day at the same time. Builds the habit.
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                variant={prefs.dailyQuizEnabled ? "default" : "outline"}
                disabled={remindersDisabled}
                onClick={() =>
                  updatePrefs({ dailyQuizEnabled: !prefs.dailyQuizEnabled })
                }
              >
                {prefs.dailyQuizEnabled ? "On" : "Off"}
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="time"
                value={prefs.dailyQuizTime}
                onChange={(e) =>
                  updatePrefs({ dailyQuizTime: e.target.value || "09:00" })
                }
                disabled={remindersDisabled || !prefs.dailyQuizEnabled}
                className="w-32"
              />
              <Button
                size="sm"
                variant="ghost"
                disabled={remindersDisabled}
                onClick={() => handleTest("daily_quiz")}
              >
                Test
              </Button>
            </div>
          </div>

          {/* Due cards */}
          <div
            className={`rounded-lg border p-3 space-y-3 ${remindersDisabled ? "opacity-60" : ""}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex gap-2">
                <Layers className="h-4 w-4 mt-0.5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Due cards reminder</p>
                  <p className="text-xs text-muted-foreground">
                    Pings you (at most once every few hours) when SRS cards are
                    overdue and you haven&apos;t reviewed today.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={remindersDisabled}
                  onClick={() => handleTest("due_cards")}
                >
                  Test
                </Button>
                <Button
                  size="sm"
                  variant={prefs.dueCardsEnabled ? "default" : "outline"}
                  disabled={remindersDisabled}
                  onClick={() =>
                    updatePrefs({ dueCardsEnabled: !prefs.dueCardsEnabled })
                  }
                >
                  {prefs.dueCardsEnabled ? "On" : "Off"}
                </Button>
              </div>
            </div>
          </div>

          {/* Streak save */}
          <div
            className={`rounded-lg border p-3 space-y-3 ${remindersDisabled ? "opacity-60" : ""}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex gap-2">
                <Flame className="h-4 w-4 mt-0.5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Streak save</p>
                  <p className="text-xs text-muted-foreground">
                    Evening nudge if you have an active streak but no activity
                    yet today.
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                variant={prefs.streakSaveEnabled ? "default" : "outline"}
                disabled={remindersDisabled}
                onClick={() =>
                  updatePrefs({ streakSaveEnabled: !prefs.streakSaveEnabled })
                }
              >
                {prefs.streakSaveEnabled ? "On" : "Off"}
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="time"
                value={prefs.streakSaveTime}
                onChange={(e) =>
                  updatePrefs({ streakSaveTime: e.target.value || "21:00" })
                }
                disabled={remindersDisabled || !prefs.streakSaveEnabled}
                className="w-32"
              />
              <Button
                size="sm"
                variant="ghost"
                disabled={remindersDisabled}
                onClick={() => handleTest("streak_save")}
              >
                Test
              </Button>
            </div>
          </div>

          {!notifEnabled && (
            <p className="text-xs text-muted-foreground">
              Turn on browser notifications above to activate these reminders.
            </p>
          )}
        </div>

        <Separator />

        {/* AI Generation Info */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-muted-foreground" />
            <label className="text-sm font-medium">AI Question Generation</label>
          </div>
          <p className="text-xs text-muted-foreground">
            Uses Google Gemini to generate interview questions from your notes.
            Find the &quot;AI Generate&quot; button on any entry&apos;s detail
            page.
          </p>
          <Badge variant="secondary" className="text-xs">
            Generates 5 questions per entry (mix of MCQ, short answer, flashcard)
          </Badge>
        </div>

        {saved && (
          <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
            <CheckCircle2 className="h-4 w-4" />
            Settings saved
          </div>
        )}
      </CardContent>
    </Card>
  );
}
