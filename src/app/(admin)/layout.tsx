import { AdminSidebar } from "@/components/layout/admin-sidebar";
import { Suspense } from "react";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex h-screen overflow-hidden bg-slate-50/50 dark:bg-slate-950/50">
      {/* Blurred portrait background */}
      <div
        className="fixed inset-0 -z-10 bg-cover bg-center bg-no-repeat blur-[60px] scale-110 opacity-[0.65] dark:opacity-[0.55] transition-opacity duration-500 pointer-events-none"
        style={{ backgroundImage: "url('/portrait.png')" }}
      />
      <Suspense fallback={<div className="w-[246px] border-r border-[#e9edf5] bg-[#fbfcfe]" />}>
        <AdminSidebar />
      </Suspense>
      <main className="flex-1 overflow-y-auto">
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
