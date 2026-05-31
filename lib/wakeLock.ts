"use client";

// Wake Lock wrapper — keeps the screen on during a round.
// Falls back silently on unsupported browsers.

let sentinel: WakeLockSentinel | null = null;
let visibilityHandler: (() => void) | null = null;
let requested = false;
let acquiring = false;

async function tryAcquire(): Promise<void> {
  if (typeof navigator === "undefined" || !("wakeLock" in navigator)) {
    console.warn("[wakeLock] not supported");
    return;
  }
  // Re-entrancy guard. Around a screen wake, the inactivity re-acquire (tap)
  // and the visibilitychange re-acquire can fire almost together. Without this
  // guard two concurrent request("screen") calls would each assign `sentinel`,
  // leaking the first lock. Skip if one is already held or in flight.
  if (sentinel || acquiring) return;
  acquiring = true;
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
  } finally {
    acquiring = false;
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

// Soft release — drop the active sentinel so the screen is allowed to sleep
// during a long idle (eating, waiting on the tee), WITHOUT tearing down the
// intent. `requested` stays true and the visibilitychange handler stays
// installed, so the lock comes back automatically: on the next user activity
// the caller re-acquires, or on a screen wake visibilitychange re-acquires.
// Deliberately NOT releaseWakeLock(), which also clears `requested` and the
// visibilitychange handler.
export async function softReleaseWakeLock(): Promise<void> {
  if (typeof window === "undefined") return;
  if (sentinel) {
    try {
      await sentinel.release();
      console.log("[wakeLock] soft-released (idle)");
    } catch (err) {
      console.warn("[wakeLock] soft release failed:", err);
    }
    sentinel = null;
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
