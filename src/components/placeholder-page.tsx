interface PlaceholderPageProps {
  title: string;
  path: string;
  icon?: string;
}

export function PlaceholderPage({ title, path, icon = "🚧" }: PlaceholderPageProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20">
      <span className="text-5xl">{icon}</span>
      <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">
        {title}
      </h1>
      <p className="text-sm text-[hsl(var(--muted-foreground))]">
        路由: <code className="rounded bg-[hsl(var(--secondary))] px-2 py-0.5 font-mono text-xs">{path}</code>
      </p>
      <span className="mt-2 inline-flex items-center rounded-full border border-[hsl(var(--border))] px-4 py-1.5 text-xs font-medium text-[hsl(var(--muted-foreground))]">
        即将上线
      </span>
    </div>
  );
}
