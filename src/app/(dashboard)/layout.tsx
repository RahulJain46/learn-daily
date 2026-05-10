import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/top-bar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { PopupQuiz } from "@/components/quiz/popup-quiz";
import { NotificationPrompt } from "@/components/quiz/notification-prompt";
import { NotificationInitializer } from "@/components/quiz/notification-initializer";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen bg-background">
      {/* Ambient background accents — subtle, enterprise-grade depth */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 -left-32 h-[480px] w-[480px] rounded-full bg-primary/10 blur-3xl opacity-60 dark:opacity-40" />
        <div className="absolute top-1/3 -right-32 h-[420px] w-[420px] rounded-full bg-chart-2/10 blur-3xl opacity-50 dark:opacity-30" />
        <div className="absolute inset-0 bg-grid-fade opacity-50 dark:opacity-30" />
      </div>

      <Sidebar />

      <div className="md:pl-64 flex flex-col min-h-screen">
        <TopBar />
        <main className="flex-1 px-4 py-5 md:px-8 md:py-7 pb-24 md:pb-10">
          <div className="mx-auto w-full max-w-7xl animate-in-fade">
            {children}
          </div>
        </main>
      </div>

      <MobileNav />
      <PopupQuiz />
      <NotificationPrompt />
      <NotificationInitializer />
    </div>
  );
}
