"use client";

import { useEffect } from "react";
import {
  registerServiceWorker,
  isNotificationsEnabled,
  startNotificationScheduler,
} from "@/lib/notifications";

export function NotificationInitializer() {
  useEffect(() => {
    registerServiceWorker();
    if (isNotificationsEnabled()) {
      startNotificationScheduler();
    }
  }, []);

  return null;
}
