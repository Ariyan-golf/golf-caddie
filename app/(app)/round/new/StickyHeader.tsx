"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * iOS Safari quirk: the layout viewport does not follow the visual viewport
 * when the keyboard or a native select dropdown closes, so a `position: sticky`
 * header can briefly render over the status bar before the next user scroll.
 * Re-toggling a transform on every visualViewport change forces a reflow that
 * snaps the sticky element back under the safe area immediately.
 */
export function StickyHeader({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const reflow = () => {
      const el = ref.current;
      if (!el) return;
      el.style.transform = "translateZ(0)";
      requestAnimationFrame(() => {
        const cur = ref.current;
        if (cur) cur.style.transform = "";
      });
    };

    vv.addEventListener("resize", reflow);
    vv.addEventListener("scroll", reflow);

    return () => {
      vv.removeEventListener("resize", reflow);
      vv.removeEventListener("scroll", reflow);
    };
  }, []);

  return (
    <div
      ref={ref}
      className="sticky top-0 -mx-4 px-4 bg-green-50 safe-area-top pb-2 z-10"
    >
      {children}
    </div>
  );
}
