import { notFound } from "next/navigation";
import { getOrCreateNote, getNoteCalendar } from "@/lib/actions/notes";
import { DailyNotebook } from "@/components/notes/daily-notebook";
import { NotesCalendarStrip } from "@/components/notes/notes-calendar-strip";
import { NotesSearch } from "@/components/notes/notes-search";

interface PageProps {
  params: Promise<{ day: string }>;
}

function isValidDay(day: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(day);
}

function buildDayLabel(day: string): { label: string; isToday: boolean } {
  const today = new Date().toISOString().slice(0, 10);
  if (day === today) return { label: "Today", isToday: true };
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (day === yesterday.toISOString().slice(0, 10)) {
    return { label: "Yesterday", isToday: false };
  }
  const d = new Date(day + "T00:00:00");
  return {
    label: d.toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    }),
    isToday: false,
  };
}

export default async function NotesDayPage({ params }: PageProps) {
  const { day } = await params;
  if (!isValidDay(day)) notFound();

  // Fetch in parallel — they don't depend on each other.
  const [noteData, calendar] = await Promise.all([
    getOrCreateNote(day),
    getNoteCalendar(14),
  ]);

  const { label, isToday } = buildDayLabel(day);

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <NotesSearch />
      <NotesCalendarStrip days={calendar} activeDay={day} />
      <DailyNotebook
        note={noteData.note}
        initialTodos={noteData.todos}
        dayLabel={label}
        isToday={isToday}
      />
    </div>
  );
}
