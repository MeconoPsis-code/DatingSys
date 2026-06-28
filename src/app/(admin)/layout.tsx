import { AdminSidebar } from "@/components/layout/admin-sidebar";
import { Suspense } from "react";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="ios-webview-shell relative isolate flex h-dvh overflow-hidden bg-slate-50/50 dark:bg-slate-950/50 md:h-screen">
      {/* Blurred portrait background */}
      <div
        className="fixed inset-0 -z-10 bg-cover bg-center bg-no-repeat blur-[60px] scale-110 opacity-[0.65] dark:opacity-[0.55] transition-opacity duration-500 pointer-events-none"
        style={{ backgroundImage: "url('/portrait.png')" }}
      />
      <Suspense fallback={<div className="hidden w-[246px] border-r border-[#e9edf5] bg-[#fbfcfe] md:block" />}>
        <AdminSidebar />
      </Suspense>
      <main className="ios-webview-scroll min-w-0 flex-1 overflow-y-auto pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0">
        <div className="p-3 sm:p-4 md:p-6">{children}</div>
      </main>
    </div>
  );
}
