"use client";

import { useEffect } from "react";
import { drainQueue } from "@/lib/offline-queue";

export default function RegisterSW() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // Register service worker
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        console.log("[SW] registered", reg.scope);
      })
      .catch((err) => {
        console.error("[SW] registration failed", err);
      });

    // iOS fallback: Safari doesn't support Background Sync API,
    // so we drain the offline queue when the browser comes back online.
    const handleOnline = async () => {
      try {
        const result = await drainQueue();
        console.log("[SW] online drain:", result);
      } catch (err) {
        console.error("[SW] online drain failed:", err);
      }
    };

    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, []);

  return null;
}
