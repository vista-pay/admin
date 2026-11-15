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

  /**
   * Leave. Nothing here touches state, which is what lets the countdown
   * effect call it: the component is on its way out, so there is no modal
   * left to close.
   */
  const signOut = useCallback(() => {
    // Fire-and-forget: the redirect must not wait on the network, but the
    // server-side revocation still has to happen - clearing a cookie alone
    // would leave a usable admin session behind.
    adminApi.logout().catch(() => undefined);
    router.replace("/login");
  }, [router]);

  /** The modal's own "Log out" button: close it, then go. */
  const logout = useCallback(() => {
    setShowModal(false);
    signOut();
  }, [signOut]);

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
  //
  // The updater only computes the next number. It used to call logout() from
  // inside itself, which React warned about as a setState during render — a
  // state updater is run during the render phase and has to be pure, so
  // redirecting and closing the modal from in there updated the Router while
  // DashboardLayout was still rendering.
  useEffect(() => {
    if (!showModal) {
      if (countdownTimer.current) clearInterval(countdownTimer.current);
      return;
    }
    countdownTimer.current = setInterval(() => {
      setCountdown((c) => (c <= 1 ? 0 : c - 1));
    }, 1000);
    return () => {
      if (countdownTimer.current) clearInterval(countdownTimer.current);
    };
  }, [showModal]);

  // Reaching zero is what signs the admin out, in an effect rather than in
  // the updater above: by the time this runs the countdown is committed, so
  // navigating away is a side effect of a finished render instead of one
  // happening during somebody else's.
  useEffect(() => {
    if (!showModal || countdown > 0) return;
    if (countdownTimer.current) clearInterval(countdownTimer.current);
    signOut();
  }, [showModal, countdown, signOut]);

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
