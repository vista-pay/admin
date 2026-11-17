"use client";

import { useEffect, useRef } from "react";
import { io, type Socket } from "socket.io-client";
import { apiFetch } from "@/lib/api";

/**
 * Where the WebSocket lives — the API's own origin, not the Next proxy the
 * REST calls go through. That proxy speaks HTTP; a socket needs the real
 * host. It is also why the handshake carries a short-lived ticket rather
 * than the session cookie, which belongs to this app's origin.
 */
const API_ORIGIN =
  process.env.NEXT_PUBLIC_API_ORIGIN ??
  (typeof window !== "undefined" ? window.location.origin.replace(/:\d+$/, ":9100") : "");

let shared: Socket | null = null;
let connecting: Promise<Socket | null> | null = null;

/** One socket per tab, shared by every hook that wants it. */
async function connect(): Promise<Socket | null> {
  if (shared?.connected) return shared;
  if (connecting) return connecting;

  connecting = (async () => {
    try {
      const { data } = await apiFetch<{ token: string }>("/admin/realtime/ticket", {
        method: "POST",
        body: "{}",
      });
      const socket = io(API_ORIGIN, {
        auth: { token: data.token },
        transports: ["websocket"],
        reconnectionAttempts: 5,
      });
      shared = socket;
      return socket;
    } catch {
      // Live updates are an improvement, never a requirement: a console whose
      // socket cannot open still works, it just waits for the next fetch.
      return null;
    } finally {
      connecting = null;
    }
  })();

  return connecting;
}

/**
 * Run `onEvent` when the server says the named thing changed. The payload is
 * a hint; what changed is fetched over REST, where authorization lives.
 */
export function useRealtimeEvent(
  event: string,
  onEvent: (payload: { communityId?: string; at?: string }) => void,
  enabled = true,
) {
  const handler = useRef(onEvent);
  // Updated in an effect, not during render. Writing `handler.current`
  // inline reads as harmless and is not: a ref write during render happens
  // before React has committed, so a render that is thrown away (a
  // Suspense retry, StrictMode's double invocation, a concurrent
  // interruption) leaves the ref pointing at a callback from a render the
  // user never saw.
  useEffect(() => {
    handler.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!enabled) return;
    let socket: Socket | null = null;
    let cancelled = false;

    const listener = (payload: { communityId?: string; at?: string }) => handler.current(payload);

    void connect().then((connected) => {
      if (cancelled || !connected) return;
      socket = connected;
      socket.on(event, listener);
    });

    return () => {
      cancelled = true;
      socket?.off(event, listener);
    };
  }, [event, enabled]);
}
