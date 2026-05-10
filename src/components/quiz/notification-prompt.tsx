"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Bell, X } from "lucide-react";
import {
  registerServiceWorker,
  isNotificationSupported,
  getNotificationPermission,
  requestNotificationPermission,
  setNotificationsEnabled,
  isNotificationsEnabled,
  startNotificationScheduler,
} from "@/lib/notifications";

const DISMISSED_KEY = "notification-prompt-dismissed";

export function NotificationPrompt() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem(DISMISSED_KEY);
    if (dismissed) return;
    if (!isNotificationSupported()) return;
    if (isNotificationsEnabled()) return;

    const permission = getNotificationPermission();
    if (permission === "granted" || permission === "denied") return;

    // Show after a short delay so it doesn't overwhelm on first load
    const timer = setTimeout(() => setShow(true), 5000);
    return () => clearTimeout(timer);
  }, []);

  const handleEnable = async () => {
    await registerServiceWorker();
    const granted = await requestNotificationPermission();
    if (granted) {
      setNotificationsEnabled(true);
      startNotificationScheduler();
    }
    setShow(false);
  };

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, "true");
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="fixed top-4 right-4 z-50 w-[340px] max-w-[calc(100vw-2rem)] animate-in slide-in-from-top-3 fade-in duration-300">
      <Card className="shadow-lg border-2 border-primary/10">
        <CardContent className="pt-4 pb-4">
          <div className="flex gap-3">
            <div className="p-2 rounded-lg bg-primary/10 h-fit">
              <Bell className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 space-y-2">
              <p className="text-sm font-medium">Turn revision into a habit</p>
              <p className="text-xs text-muted-foreground">
                Get a daily quiz, due-card pings, and an evening streak save
                — only when they&apos;re actually useful. Tune it in Settings.
              </p>
              <div className="flex gap-2">
                <Button size="sm" className="text-xs" onClick={handleEnable}>
                  Enable
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs"
                  onClick={handleDismiss}
                >
                  Not now
                </Button>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              onClick={handleDismiss}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
