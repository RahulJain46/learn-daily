import { QuizSettings } from "@/components/quiz/quiz-settings";

export default function SettingsPage() {
  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Configure your quiz and notification preferences.
        </p>
      </div>

      <QuizSettings />
    </div>
  );
}
