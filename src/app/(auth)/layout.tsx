export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="ios-webview-auth-shell relative isolate flex min-h-screen min-h-dvh items-center justify-center overflow-hidden bg-slate-50/50 px-4 dark:bg-slate-950/50">
      {/* Blurred portrait background */}
      <div
        className="fixed inset-0 -z-10 bg-cover bg-center bg-no-repeat blur-[60px] scale-110 opacity-[0.65] dark:opacity-[0.55] transition-opacity duration-500 pointer-events-none"
        style={{ backgroundImage: "url('/portrait.png')" }}
      />
      <div className="relative z-10 w-full max-w-2xl py-8">{children}</div>
    </div>
  );
}
