"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => console.log("[sw] registered, scope:", reg.scope))
      .catch((err) => console.warn("[sw] register failed:", err));
  }, []);

  return null;
}
