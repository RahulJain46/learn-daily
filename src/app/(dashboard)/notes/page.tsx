import { redirect } from "next/navigation";

/**
 * `/notes` is just a friendly entry point — we redirect to today's date so
 * the URL is shareable and the [day] route is the single source of truth.
 *
 * Note: we compute "today" using the SERVER's clock here, which can differ
 * from the user's local clock by up to ~24h in extreme cases. The trade-off
 * is acceptable for v1 (Vercel + Supabase are both UTC); a follow-up could
 * read a `?tz=` query param set by a tiny client redirect on first load.
 */
export default function NotesIndexPage() {
  const today = new Date().toISOString().slice(0, 10);
  redirect(`/notes/${today}`);
}
