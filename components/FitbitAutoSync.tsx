"use client";

import { useEffect } from "react";

/**
 * Fire-and-forget Fitbit sync on every mount (i.e. every page refresh).
 * Renders nothing — just triggers the sync silently in the background.
 */
export function FitbitAutoSync() {
  useEffect(() => {
    fetch("/api/fitbit/sync", { method: "POST" }).catch(() => {
      // Silently ignore — sync is best-effort on refresh
    });
  }, []);

  return null;
}
