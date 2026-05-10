/**
 * Notifications: in-app pop quiz interval (existing) + three distinct
 * "behavior-change" reminders driven by a single client-side scheduler.
 *
 *  1. daily_quiz   — fires once per day at a user-chosen time (HH:mm).
 *  2. due_cards    — fires when there are SRS cards past their due date and
 *                    we haven't pinged the user about it recently.
 *  3. streak_save  — fires in the evening if the user has an active streak
 *                    but hasn't done anything today.
 *
 * The service worker actually shows the notification; this module is the
 * brain that decides when/why and dispatches a `postMessage` to the SW.
 *
 * State is stored in localStorage so we don't double-fire across tab
 * reloads. The scheduler runs on a slow tick (every 60s) and is also
 * nudged whenever the tab regains focus.
 */

const SW_PATH = "/sw.js";

// ---------- localStorage keys ----------
const NOTIF_ENABLED_KEY = "quiz-notifications-enabled";
const NOTIF_FREQUENCY_KEY = "popup-quiz-frequency";

const NOTIF_DAILY_ENABLED_KEY = "notif-daily-enabled";
const NOTIF_DUE_ENABLED_KEY = "notif-due-enabled";
const NOTIF_STREAK_ENABLED_KEY = "notif-streak-enabled";

const DAILY_QUIZ_TIME_KEY = "notif-daily-time"; // "HH:mm"
const STREAK_SAVE_TIME_KEY = "notif-streak-time"; // "HH:mm"

const LAST_FIRED_DAILY_KEY = "notif-last-fired-daily"; // YYYY-MM-DD
const LAST_FIRED_DUE_KEY = "notif-last-fired-due"; // ISO timestamp
const LAST_FIRED_STREAK_KEY = "notif-last-fired-streak"; // YYYY-MM-DD

// ---------- defaults ----------
const DEFAULT_FREQUENCY_MS = 30 * 60 * 1000;
const DEFAULT_DAILY_TIME = "09:00";
const DEFAULT_STREAK_TIME = "21:00";

/** Re-prompt about due cards at most once every N hours. */
const DUE_REMINDER_COOLDOWN_MS = 4 * 60 * 60 * 1000;

/** How often the scheduler wakes up to evaluate firing conditions. */
const SCHEDULER_TICK_MS = 60 * 1000;

// ---------- types ----------
export type NotificationKind = "daily_quiz" | "due_cards" | "streak_save";

export interface NotificationPayload {
  kind: NotificationKind;
  title: string;
  body: string;
  url: string;
  tag: string;
}

interface QuizStatus {
  cardsDue: number;
  streak: number;
  activeToday: boolean;
  reviewsToday: number;
}

// ============================================================
// Service worker / permission helpers
// ============================================================

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }
  try {
    return await navigator.serviceWorker.register(SW_PATH);
  } catch {
    return null;
  }
}

export function isNotificationSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function getNotificationPermission():
  | NotificationPermission
  | "unsupported" {
  if (!isNotificationSupported()) return "unsupported";
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!isNotificationSupported()) return false;
  const permission = await Notification.requestPermission();
  return permission === "granted";
}

// ============================================================
// Master toggle (kept for back-compat with existing UI)
// ============================================================

export function isNotificationsEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(NOTIF_ENABLED_KEY) === "true";
}

export function setNotificationsEnabled(enabled: boolean): void {
  localStorage.setItem(NOTIF_ENABLED_KEY, enabled ? "true" : "false");
}

// ============================================================
// In-app pop quiz frequency (existing feature, untouched)
// ============================================================

export function getNotificationFrequencyMs(): number {
  if (typeof window === "undefined") return DEFAULT_FREQUENCY_MS;
  const stored = localStorage.getItem(NOTIF_FREQUENCY_KEY);
  return stored ? parseInt(stored, 10) : DEFAULT_FREQUENCY_MS;
}

// ============================================================
// Per-kind preferences
// ============================================================

function readBool(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  const v = localStorage.getItem(key);
  if (v === null) return fallback;
  return v === "true";
}

function readString(key: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  return localStorage.getItem(key) ?? fallback;
}

export interface NotificationPrefs {
  dailyQuizEnabled: boolean;
  dueCardsEnabled: boolean;
  streakSaveEnabled: boolean;
  /** "HH:mm" — local time for the daily quiz. */
  dailyQuizTime: string;
  /** "HH:mm" — local time for the evening streak-save check. */
  streakSaveTime: string;
}

export function getNotificationPrefs(): NotificationPrefs {
  return {
    dailyQuizEnabled: readBool(NOTIF_DAILY_ENABLED_KEY, true),
    dueCardsEnabled: readBool(NOTIF_DUE_ENABLED_KEY, true),
    streakSaveEnabled: readBool(NOTIF_STREAK_ENABLED_KEY, true),
    dailyQuizTime: readString(DAILY_QUIZ_TIME_KEY, DEFAULT_DAILY_TIME),
    streakSaveTime: readString(STREAK_SAVE_TIME_KEY, DEFAULT_STREAK_TIME),
  };
}

export function setNotificationPrefs(patch: Partial<NotificationPrefs>): void {
  if (typeof window === "undefined") return;
  if (patch.dailyQuizEnabled !== undefined)
    localStorage.setItem(
      NOTIF_DAILY_ENABLED_KEY,
      patch.dailyQuizEnabled ? "true" : "false",
    );
  if (patch.dueCardsEnabled !== undefined)
    localStorage.setItem(
      NOTIF_DUE_ENABLED_KEY,
      patch.dueCardsEnabled ? "true" : "false",
    );
  if (patch.streakSaveEnabled !== undefined)
    localStorage.setItem(
      NOTIF_STREAK_ENABLED_KEY,
      patch.streakSaveEnabled ? "true" : "false",
    );
  if (patch.dailyQuizTime !== undefined)
    localStorage.setItem(DAILY_QUIZ_TIME_KEY, patch.dailyQuizTime);
  if (patch.streakSaveTime !== undefined)
    localStorage.setItem(STREAK_SAVE_TIME_KEY, patch.streakSaveTime);
}

// ============================================================
// Notification dispatch (sends a message to the SW)
// ============================================================

async function showNotification(payload: NotificationPayload): Promise<void> {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  if (getNotificationPermission() !== "granted") return;
  try {
    const registration = await navigator.serviceWorker.ready;
    registration.active?.postMessage({
      type: "SHOW_NOTIFICATION",
      payload,
    });
  } catch {
    // SW might not be active yet — fail silently.
  }
}

/**
 * Legacy helper used by the in-app popup path. Kept so the existing
 * `showQuizNotification` callers keep working.
 */
export async function showQuizNotification(body?: string): Promise<void> {
  await showNotification({
    kind: "daily_quiz",
    title: "Time to Revise!",
    body: body || "A quick question is waiting for you.",
    url: "/revise/quick-quiz",
    tag: "quiz-reminder",
  });
}

// ============================================================
// Time helpers
// ============================================================

function parseHHMM(value: string): { hours: number; minutes: number } {
  const [h, m] = value.split(":").map((p) => parseInt(p, 10));
  return {
    hours: Number.isFinite(h) ? Math.max(0, Math.min(23, h)) : 9,
    minutes: Number.isFinite(m) ? Math.max(0, Math.min(59, m)) : 0,
  };
}

function todayKey(): string {
  return new Date().toISOString().split("T")[0];
}

function isPastTimeToday(time: string): boolean {
  const now = new Date();
  const { hours, minutes } = parseHHMM(time);
  const target = new Date();
  target.setHours(hours, minutes, 0, 0);
  return now.getTime() >= target.getTime();
}

// ============================================================
// Status fetch (cheap — used to decide due/streak firings)
// ============================================================

let statusCache: { value: QuizStatus; fetchedAt: number } | null = null;
const STATUS_CACHE_MS = 90 * 1000;

async function fetchStatus(): Promise<QuizStatus | null> {
  const now = Date.now();
  if (statusCache && now - statusCache.fetchedAt < STATUS_CACHE_MS) {
    return statusCache.value;
  }
  try {
    const res = await fetch("/api/quiz/status", { cache: "no-store" });
    if (!res.ok) return null;
    const value = (await res.json()) as QuizStatus;
    statusCache = { value, fetchedAt: now };
    return value;
  } catch {
    return null;
  }
}

/** Force the next status fetch to skip the cache. */
export function invalidateStatusCache(): void {
  statusCache = null;
}

// ============================================================
// Per-kind firing rules
// ============================================================

function shouldFireDailyQuiz(prefs: NotificationPrefs): boolean {
  if (!prefs.dailyQuizEnabled) return false;
  if (!isPastTimeToday(prefs.dailyQuizTime)) return false;
  const last = localStorage.getItem(LAST_FIRED_DAILY_KEY);
  return last !== todayKey();
}

function shouldFireDueCards(
  prefs: NotificationPrefs,
  status: QuizStatus,
): boolean {
  if (!prefs.dueCardsEnabled) return false;
  if (status.cardsDue <= 0) return false;
  // Don't double-fire daily-quiz + due-cards at the same minute.
  // If the user already did reviews today, skip — they're engaged.
  if (status.reviewsToday > 0) return false;
  const last = localStorage.getItem(LAST_FIRED_DUE_KEY);
  if (!last) return true;
  const lastMs = parseInt(last, 10);
  if (!Number.isFinite(lastMs)) return true;
  return Date.now() - lastMs > DUE_REMINDER_COOLDOWN_MS;
}

function shouldFireStreakSave(
  prefs: NotificationPrefs,
  status: QuizStatus,
): boolean {
  if (!prefs.streakSaveEnabled) return false;
  if (status.streak <= 0) return false;
  if (status.activeToday) return false;
  if (!isPastTimeToday(prefs.streakSaveTime)) return false;
  const last = localStorage.getItem(LAST_FIRED_STREAK_KEY);
  return last !== todayKey();
}

// ============================================================
// Firing (dispatch + persist "last fired")
// ============================================================

async function fireDailyQuiz(): Promise<void> {
  await showNotification({
    kind: "daily_quiz",
    title: "Daily Quiz",
    body: "A fresh question is waiting — keep the momentum going.",
    url: "/revise/quick-quiz",
    tag: "daily-quiz",
  });
  localStorage.setItem(LAST_FIRED_DAILY_KEY, todayKey());
}

async function fireDueCards(status: QuizStatus): Promise<void> {
  const n = status.cardsDue;
  await showNotification({
    kind: "due_cards",
    title: n === 1 ? "1 card is due" : `${n} cards are due`,
    body:
      n === 1
        ? "Take 30 seconds to review the one card you have due."
        : `Review your due cards before they pile up.`,
    url: "/revise",
    tag: "due-cards",
  });
  localStorage.setItem(LAST_FIRED_DUE_KEY, Date.now().toString());
}

async function fireStreakSave(status: QuizStatus): Promise<void> {
  await showNotification({
    kind: "streak_save",
    title: `Don't lose your ${status.streak}-day streak`,
    body: "Log one quick review or note today to keep it alive.",
    url: "/",
    tag: "streak-save",
  });
  localStorage.setItem(LAST_FIRED_STREAK_KEY, todayKey());
}

// ============================================================
// Scheduler
// ============================================================

let tickInterval: ReturnType<typeof setInterval> | null = null;
let focusListener: (() => void) | null = null;
/** Legacy in-app interval (popup quiz). Preserved for back-compat. */
let popupInterval: ReturnType<typeof setInterval> | null = null;

async function tick(): Promise<void> {
  if (typeof window === "undefined") return;
  if (!isNotificationsEnabled()) return;
  if (getNotificationPermission() !== "granted") return;

  const prefs = getNotificationPrefs();

  // Daily quiz only needs the local clock — no fetch required.
  if (shouldFireDailyQuiz(prefs)) {
    await fireDailyQuiz();
  }

  // Both of these need server signal — fetch lazily and only if at least
  // one of them is enabled (saves needless API hits for users who turned
  // them off).
  if (prefs.dueCardsEnabled || prefs.streakSaveEnabled) {
    const status = await fetchStatus();
    if (!status) return;

    if (shouldFireDueCards(prefs, status)) {
      await fireDueCards(status);
    }
    if (shouldFireStreakSave(prefs, status)) {
      await fireStreakSave(status);
    }
  }
}

export function startNotificationScheduler(): void {
  stopNotificationScheduler();
  if (typeof window === "undefined") return;
  if (!isNotificationsEnabled()) return;
  if (getNotificationPermission() !== "granted") return;

  // Legacy: the in-app popup also pings with a generic notification when
  // the tab is hidden. Keep this so existing UX doesn't change.
  const frequencyMs = getNotificationFrequencyMs();
  popupInterval = setInterval(() => {
    if (document.hidden) {
      void showQuizNotification();
    }
  }, frequencyMs);

  // New: smart per-kind scheduler.
  void tick(); // run once immediately so first-time enabling feels responsive
  tickInterval = setInterval(() => {
    void tick();
  }, SCHEDULER_TICK_MS);

  focusListener = () => {
    invalidateStatusCache();
    void tick();
  };
  window.addEventListener("focus", focusListener);
  document.addEventListener("visibilitychange", focusListener);
}

export function stopNotificationScheduler(): void {
  if (popupInterval) {
    clearInterval(popupInterval);
    popupInterval = null;
  }
  if (tickInterval) {
    clearInterval(tickInterval);
    tickInterval = null;
  }
  if (focusListener && typeof window !== "undefined") {
    window.removeEventListener("focus", focusListener);
    document.removeEventListener("visibilitychange", focusListener);
    focusListener = null;
  }
}

// ============================================================
// Manual triggers (used by the Settings "Test" buttons)
// ============================================================

export async function testNotification(kind: NotificationKind): Promise<void> {
  const status = (await fetchStatus()) ?? {
    cardsDue: 3,
    streak: 7,
    activeToday: false,
    reviewsToday: 0,
  };
  if (kind === "daily_quiz") {
    await showNotification({
      kind,
      title: "Daily Quiz (test)",
      body: "This is what your daily reminder will look like.",
      url: "/revise/quick-quiz",
      tag: "daily-quiz-test",
    });
  } else if (kind === "due_cards") {
    await showNotification({
      kind,
      title: `${status.cardsDue || 3} cards are due (test)`,
      body: "This is what your due-cards reminder will look like.",
      url: "/revise",
      tag: "due-cards-test",
    });
  } else {
    await showNotification({
      kind,
      title: `Don't lose your ${status.streak || 7}-day streak (test)`,
      body: "This is what your streak-save reminder will look like.",
      url: "/",
      tag: "streak-save-test",
    });
  }
}
