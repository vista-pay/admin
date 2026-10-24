"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { adminApi, hasSessionFlag } from "@/lib/api";

const IDLE_MS = 15 * 60 * 1000; // 15 minutes
const COUNTDOWN_S = 60;

export function useInactivity() {
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);
  const [countdown, setCountdown] = useState(COUNTDOWN_S);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const logout = useCallback(() => {
    setShowModal(false);
    // Fire-and-forget: the redirect must not wait on the network, but the
    // server-side revocation still has to happen - clearing a cookie alone
    // would leave a usable admin session behind.
    adminApi.logout().catch(() => undefined);
    router.replace("/login");
  }, [router]);

  const resetIdle = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    // don't reset while modal is open — let countdown handle it
    if (showModal) return;
    idleTimer.current = setTimeout(() => {
      setShowModal(true);
      setCountdown(COUNTDOWN_S);
    }, IDLE_MS);
  }, [showModal]);

  const stayLoggedIn = useCallback(() => {
    setShowModal(false);
    setCountdown(COUNTDOWN_S);
    if (countdownTimer.current) clearInterval(countdownTimer.current);
    resetIdle();
  }, [resetIdle]);

  // start / reset idle timer on activity
  useEffect(() => {
    // don't run on login/mfa or if not authenticated
    const path = window.location.pathname;
    if (path === "/login" || path === "/mfa" || !hasSessionFlag()) return;

    const events: (keyof WindowEventMap)[] = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "click"];
    const handler = () => resetIdle();

    events.forEach((e) => window.addEventListener(e, handler, { passive: true }));
    resetIdle();

    return () => {
      events.forEach((e) => window.removeEventListener(e, handler));
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [resetIdle]);

  // countdown when modal is open
  useEffect(() => {
    if (!showModal) {
      if (countdownTimer.current) clearInterval(countdownTimer.current);
      return;
    }
    countdownTimer.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          if (countdownTimer.current) clearInterval(countdownTimer.current);
          logout();
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => {
      if (countdownTimer.current) clearInterval(countdownTimer.current);
    };
  }, [showModal, logout]);

  // also reset on visibility change (user returns to tab)
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible" && !showModal) resetIdle();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [resetIdle, showModal]);

  return { showModal, countdown, stayLoggedIn, logout };
}
