import { ScorerNav } from "@/components/layout/scorer-nav";

export default function ScorerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <ScorerNav />
      <main className="mx-auto max-w-2xl px-4 py-6">{children}</main>
    </div>
  );
}
