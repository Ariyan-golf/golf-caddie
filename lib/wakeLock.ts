"use client";

// Wake Lock wrapper — keeps the screen on during a round.
// Falls back silently on unsupported browsers.

let sentinel: WakeLockSentinel | null = null;
let visibilityHandler: (() => void) | null = null;
let requested = false;

async function tryAcquire(): Promise<void> {
  if (typeof navigator === "undefined" || !("wakeLock" in navigator)) {
    console.warn("[wakeLock] not supported");
    return;
  }
  try {
    sentinel = await navigator.wakeLock.request("screen");
    sentinel.addEventListener("release", () => {
      console.log("[wakeLock] released by system");
      sentinel = null;
    });
    console.log("[wakeLock] acquired");
  } catch (err) {
    console.warn("[wakeLock] acquire failed:", err);
    sentinel = null;
  }
}

export async function acquireWakeLock(): Promise<void> {
  if (typeof window === "undefined") return;
  requested = true;

  await tryAcquire();

  if (!visibilityHandler) {
    visibilityHandler = () => {
      if (document.visibilityState === "visible" && requested && !sentinel) {
        void tryAcquire();
      }
    };
    document.addEventListener("visibilitychange", visibilityHandler);
  }
}

export async function releaseWakeLock(): Promise<void> {
  if (typeof window === "undefined") return;
  requested = false;

  if (visibilityHandler) {
    document.removeEventListener("visibilitychange", visibilityHandler);
    visibilityHandler = null;
  }

  if (sentinel) {
    try {
      await sentinel.release();
      console.log("[wakeLock] released");
    } catch (err) {
      console.warn("[wakeLock] release failed:", err);
    }
    sentinel = null;
  }
}
