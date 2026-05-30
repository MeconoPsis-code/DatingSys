import { MainNav } from "@/components/layout/main-nav";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      <MainNav />
      <main className="flex-1 pb-16 md:pb-0">
        <div className="mx-auto max-w-3xl px-4 py-6">{children}</div>
      </main>
    </div>
  );
}
