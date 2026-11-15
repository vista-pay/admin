import { DashboardShell } from "./dashboard-shell";

/**
 * The dashboard shell blocks, and says so.
 *
 * Cache Components validates that navigating into a segment paints something
 * immediately. Nothing under here can: the shell waits on the session cookie
 * and then on the signed-in admin's profile, because which areas they may
 * open — and whether they are being forced to change their password — is not
 * knowable until that profile arrives. Rendering the page underneath while
 * the answer is outstanding would flash an area the admin may not be allowed
 * to see, which is the opposite of what an access gate is for.
 *
 * So this is a deliberate opt-out rather than an unresolved warning, placed
 * on the dashboard group rather than the root layout so the sign-in and
 * password routes outside it keep being validated.
 *
 * It has to live in a server file: `instant` throws if it is exported from a
 * Client Component, and the shell below is one — hence the split.
 */
export const instant = false;

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <DashboardShell>{children}</DashboardShell>;
}
