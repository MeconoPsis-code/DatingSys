"use client";

import { useState } from "react";

const DEFAULT_PREVIEW_LENGTH = 120;

interface CollapsibleSelfIntroProps {
  text: string | null | undefined;
  className?: string;
  previewLength?: number;
  title?: string;
}

export function CollapsibleSelfIntro({
  text,
  className = "",
  previewLength = DEFAULT_PREVIEW_LENGTH,
  title = "自我介绍",
}: CollapsibleSelfIntroProps) {
  const [expanded, setExpanded] = useState(false);
  const trimmedText = text?.trim();

  if (!trimmedText) return null;

  const canExpand = trimmedText.length > previewLength;
  const displayText =
    canExpand && !expanded
      ? `${trimmedText.slice(0, previewLength).trimEnd()}...`
      : trimmedText;

  return (
    <div
      className={`rounded-lg bg-[hsl(var(--secondary)/0.5)] px-3 py-2 text-xs leading-relaxed text-[hsl(var(--muted-foreground))] ${className}`}
    >
      <div className="mb-1 text-[10px] font-medium text-[hsl(var(--foreground))]">
        {title}
      </div>
      <p className="whitespace-pre-wrap break-words">{displayText}</p>
      {canExpand && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="mt-1.5 text-xs font-medium text-brand-blue transition-colors hover:text-brand-blue/80 hover:underline"
        >
          {expanded ? "收起" : "展开查看详细介绍"}
        </button>
      )}
    </div>
  );
}
