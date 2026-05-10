// LearnDaily service worker.
//
// Receives `postMessage` events from the page and surfaces native
// notifications for three distinct flows:
//   - daily_quiz   -> /revise/quick-quiz
//   - due_cards    -> /revise
//   - streak_save  -> /
//
// On notification click we focus an existing app tab if any, deep-linking
// to the URL embedded in the notification data.

const DEFAULT_URL = "/";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

function focusOrOpen(targetUrl) {
  return self.clients
    .matchAll({ type: "window", includeUncontrolled: true })
    .then((clients) => {
      // Prefer an existing tab pointed at the same path.
      for (const client of clients) {
        try {
          const url = new URL(client.url);
          if (url.pathname === targetUrl && "focus" in client) {
            return client.focus();
          }
        } catch {
          // ignore
        }
      }
      // Otherwise navigate the first available app tab.
      for (const client of clients) {
        if ("navigate" in client && "focus" in client) {
          return client.navigate(targetUrl).then(() => client.focus());
        }
      }
      // No tab open — open a new one.
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    });
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  if (event.action === "dismiss") return;
  const data = event.notification.data || {};
  const targetUrl = data.url || DEFAULT_URL;
  event.waitUntil(focusOrOpen(targetUrl));
});

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data) return;

  // New per-kind path.
  if (data.type === "SHOW_NOTIFICATION" && data.payload) {
    const { kind, title, body, url, tag } = data.payload;
    const actions =
      kind === "streak_save"
        ? [
            { action: "open", title: "Save streak" },
            { action: "dismiss", title: "Skip" },
          ]
        : kind === "due_cards"
          ? [
              { action: "open", title: "Review now" },
              { action: "dismiss", title: "Later" },
            ]
          : [
              { action: "open", title: "Take Quiz" },
              { action: "dismiss", title: "Later" },
            ];

    self.registration.showNotification(title, {
      body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: tag || kind,
      renotify: true,
      data: { url, kind },
      actions,
    });
    return;
  }

  // Back-compat: the legacy popup-quiz interval still uses this message.
  if (data.type === "SHOW_QUIZ_NOTIFICATION") {
    self.registration.showNotification("Time to Revise!", {
      body: data.body || "A quick question is waiting for you.",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: "quiz-reminder",
      renotify: true,
      data: { url: "/revise/quick-quiz", kind: "daily_quiz" },
      actions: [
        { action: "open", title: "Take Quiz" },
        { action: "dismiss", title: "Later" },
      ],
    });
  }
});
