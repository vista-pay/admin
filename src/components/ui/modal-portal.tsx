"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

/** The mount check never changes after hydration, so nothing to subscribe to. */
const noop = () => () => {};

/**
 * Renders a dialog at <body>, outside whatever stacking context it was
 * written in.
 *
 * A dialog declared next to the thing it acts on inherits that spot in the
 * paint order, and `z-index` can only rank it against its siblings. The
 * community decision dialog lives inside the review panel, which is
 * `xl:sticky` — and a sticky element always forms a stacking context — so its
 * z-[80] was being compared inside that panel rather than against the page.
 * The verification queue's `sticky top-0 z-10` table header outranked the
 * whole panel and painted straight over the dialog, cutting off its title.
 *
 * Portalling removes the entire class of bug rather than re-tuning two
 * numbers: at <body> the dialog is only ever ranked against the page's own
 * top-level layers.
 */
export function ModalPortal({ children }: { children: React.ReactNode }) {
  // There is no document to portal into during the server render, and the
  // first client render has to match it. useSyncExternalStore gives exactly
  // that split — false on the server, true once hydrated — without the
  // setState-in-effect the React Compiler rejects.
  const mounted = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );

  if (!mounted) return null;
  return createPortal(children, document.body);
}
