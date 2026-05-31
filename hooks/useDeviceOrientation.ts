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

export function useDeviceOrientation(enabled: boolean = true) {
  const [heading, setHeading] = useState<number | null>(null);
  const [sensorState, setSensorState] = useState<SensorState>("unknown");

  const listenerRef = useRef<((e: DeviceOrientationEvent) => void) | null>(null);
  const eventNameRef = useRef<"deviceorientation" | "deviceorientationabsolute">("deviceorientation");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gotFirstEventRef = useRef(false);
  // iOS は requestPermission がユーザー操作起点。一度 granted になったら、
  // 非表示→再表示で再度 attach できるよう記録しておく（再許可は不要）。
  const permissionGrantedRef = useRef(false);

  const detachListener = useCallback(() => {
    if (typeof window === "undefined") return;
    if (listenerRef.current) {
      window.removeEventListener(eventNameRef.current, listenerRef.current);
      listenerRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

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
          permissionGrantedRef.current = true;
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
    permissionGrantedRef.current = true;
    attachListener();
    return true;
  }, [attachListener]);

  // Attach the orientation listener only while `enabled` (= the wind compass is
  // actually shown). 発熱対策: 非表示中はセンサーを回さない。
  // - Android（requestPermission 不要）: enabled になった瞬間に attach、
  //   非表示・アンマウントで detach。従来の「マウント時に無条件で即 attach」を
  //   表示状態連動に変更。
  // - iOS: 初回は requestPermission（ユーザー操作）待ち。一度 granted なら、
  //   再表示時に attach し直す（再許可は不要）。非表示時は detach。
  useEffect(() => {
    if (typeof window === "undefined") return;

    const DOE = (typeof DeviceOrientationEvent === "undefined"
      ? null
      : (DeviceOrientationEvent as IosDeviceOrientationEvent));
    const needsPermission = !!DOE && typeof DOE.requestPermission === "function";

    if (!DOE) {
      setSensorState("unsupported");
      return;
    }

    if (!enabled) {
      detachListener();
      return;
    }

    if (!needsPermission) {
      attachListener();
    } else if (permissionGrantedRef.current) {
      attachListener();
    }
    // iOS で未許可の場合は requestPermission() のユーザー操作を待つ。

    return () => {
      detachListener();
    };
  }, [enabled, attachListener, detachListener]);

  const isSupported = sensorState !== "unsupported" && sensorState !== "denied";

  return { heading, requestPermission, isSupported, sensorState };
}
