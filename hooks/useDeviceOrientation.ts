"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type WebkitOrientationEvent = DeviceOrientationEvent & {
  webkitCompassHeading?: number;
};

type IosDeviceOrientationEvent = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

function getCompassHeading(event: DeviceOrientationEvent): number | null {
  const ev = event as WebkitOrientationEvent;
  if (typeof ev.webkitCompassHeading === "number") {
    return ev.webkitCompassHeading;
  }
  if (event.absolute && event.alpha != null) {
    return (360 - event.alpha) % 360;
  }
  return null;
}

export type SensorState = "unknown" | "granted" | "denied" | "unsupported";

export function useDeviceOrientation() {
  const [heading, setHeading] = useState<number | null>(null);
  const [sensorState, setSensorState] = useState<SensorState>("unknown");

  const listenerRef = useRef<((e: DeviceOrientationEvent) => void) | null>(null);
  const eventNameRef = useRef<"deviceorientation" | "deviceorientationabsolute">("deviceorientation");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gotFirstEventRef = useRef(false);

  const attachListener = useCallback(() => {
    if (typeof window === "undefined") return;
    if (listenerRef.current) return;

    const eventName: "deviceorientation" | "deviceorientationabsolute" =
      "ondeviceorientationabsolute" in window ? "deviceorientationabsolute" : "deviceorientation";
    eventNameRef.current = eventName;

    const listener = (e: DeviceOrientationEvent) => {
      const h = getCompassHeading(e);
      if (h !== null) {
        gotFirstEventRef.current = true;
        setSensorState("granted");
        setHeading(h);
      }
    };
    listenerRef.current = listener;
    window.addEventListener(eventName, listener);

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      if (!gotFirstEventRef.current) setSensorState("unsupported");
    }, 2000);
  }, []);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (typeof window === "undefined") return false;

    const DOE = (typeof DeviceOrientationEvent === "undefined"
      ? null
      : (DeviceOrientationEvent as IosDeviceOrientationEvent));

    if (DOE && typeof DOE.requestPermission === "function") {
      try {
        const result = await DOE.requestPermission();
        if (result === "granted") {
          attachListener();
          return true;
        }
        setSensorState("denied");
        return false;
      } catch {
        setSensorState("denied");
        return false;
      }
    }
    // Non-iOS: no permission needed
    attachListener();
    return true;
  }, [attachListener]);

  // On Android (no requestPermission), attach immediately so the compass
  // is live as soon as the component mounts. iOS waits for an explicit
  // requestPermission() call gated behind a user gesture.
  useEffect(() => {
    if (typeof window === "undefined") return;

    const DOE = (typeof DeviceOrientationEvent === "undefined"
      ? null
      : (DeviceOrientationEvent as IosDeviceOrientationEvent));
    const needsPermission = !!DOE && typeof DOE.requestPermission === "function";

    if (!DOE) {
      setSensorState("unsupported");
    } else if (!needsPermission) {
      attachListener();
    }

    return () => {
      if (listenerRef.current) {
        window.removeEventListener(eventNameRef.current, listenerRef.current);
        listenerRef.current = null;
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [attachListener]);

  const isSupported = sensorState !== "unsupported" && sensorState !== "denied";

  return { heading, requestPermission, isSupported, sensorState };
}
