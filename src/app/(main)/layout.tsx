import { MainNav } from "@/components/layout/main-nav";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex h-dvh overflow-hidden bg-slate-50/50 dark:bg-slate-950/50 md:h-screen">
      {/* Blurred portrait background */}
      <div
        className="fixed inset-0 -z-10 bg-cover bg-center bg-no-repeat blur-[60px] scale-110 opacity-[0.65] dark:opacity-[0.55] transition-opacity duration-500 pointer-events-none"
        style={{ backgroundImage: "url('/portrait.png')" }}
      />
      <MainNav />
      <main className="min-w-0 flex-1 overflow-y-auto pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0">
        <div className="mx-auto max-w-3xl px-3 py-4 sm:px-4 sm:py-6">{children}</div>
      </main>
    </div>
  );
}
