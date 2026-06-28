import { ScorerNav } from "@/components/layout/scorer-nav";

export default function ScorerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative isolate min-h-screen min-h-dvh bg-slate-50/50 dark:bg-slate-950/50">
      {/* Blurred portrait background */}
      <div
        className="fixed inset-0 -z-10 bg-cover bg-center bg-no-repeat blur-[60px] scale-110 opacity-[0.65] dark:opacity-[0.55] transition-opacity duration-500 pointer-events-none"
        style={{ backgroundImage: "url('/portrait.png')" }}
      />
      <ScorerNav />
      <main className="mx-auto max-w-2xl px-3 py-4 sm:px-4 sm:py-6">{children}</main>
    </div>
  );
}
