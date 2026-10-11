"use client";

import { useEffect, useRef } from "react";

const POLL_INTERVAL_MS = 5_000;
const POLL_WINDOW_MS = 2 * 60_000;

/** Refresh one visible page, and bound each pending/focus polling session to two minutes. */
export function useGroupCardRefresh({
  enabled,
  pending,
  cardRevision,
  refresh,
}: {
  enabled: boolean;
  pending: boolean;
  cardRevision: number | undefined;
  refresh: () => Promise<unknown>;
}) {
  const refreshRef = useRef(refresh);
  useEffect(() => { refreshRef.current = refresh; }, [refresh]);

  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let deadline = Date.now() + POLL_WINDOW_MS;

    function clearTimer() {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    }

    function schedule() {
      clearTimer();
      if (!disposed && pending && document.visibilityState === "visible" && Date.now() < deadline) {
        timer = setTimeout(() => { void poll(); }, POLL_INTERVAL_MS);
      }
    }

    async function poll() {
      if (disposed || document.visibilityState !== "visible" || Date.now() >= deadline) return;
      try { await refreshRef.current(); } catch { /* A later focus or retry can recover from a transient refresh error. */ }
      schedule();
    }

    async function refreshOnReturn() {
      if (disposed || document.visibilityState !== "visible") return;
      deadline = Date.now() + POLL_WINDOW_MS;
      clearTimer();
      try { await refreshRef.current(); } catch { /* Keep the last reliable data visible. */ }
      schedule();
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible") void refreshOnReturn();
      else clearTimer();
    }

    function onFocus() { void refreshOnReturn(); }

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);
    schedule();
    return () => {
      disposed = true;
      clearTimer();
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [enabled, pending, cardRevision]);
}
