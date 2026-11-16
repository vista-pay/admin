/**
 * Catalogue types and fallbacks shared by the Content & offers list and the
 * banner composer page. The server's catalogues
 * (backend/src/modules/admin/content-placements.ts) are the source of truth;
 * these fallbacks cover the moment before they arrive and must stay a subset
 * of them — the server refuses banner slugs it does not know.
 */

export type Placement = { slug: string; label: string; surface: string };
export type Destination = { path: string; label: string; defaultCta: string };
export type AudiencePreset = { key: string; label: string };

export const FALLBACK_PLACEMENTS: Placement[] = [
  { slug: "home_carousel", label: "Home carousel", surface: "Rendi app · Home tab, below quick actions" },
  { slug: "ajo_tab", label: "Ajo tab", surface: "Rendi app · Ajo tab header" },
  { slug: "pay_tab", label: "Pay tab", surface: "Rendi app · Pay tab header" },
  { slug: "communities_tab", label: "Communities tab", surface: "Rendi app · Communities tab header" },
  { slug: "opportunities_tab", label: "Opportunities tab", surface: "Rendi app · partner offers surface" },
];

export const FALLBACK_DESTINATIONS: Destination[] = [
  { path: "/ajo/create", label: "Create an Ajo group", defaultCta: "Create Ajo" },
  { path: "/(tabs)/ajo", label: "Ajo tab", defaultCta: "Open Ajo" },
  { path: "/(tabs)/pay", label: "Pay & bills tab", defaultCta: "Pay bills" },
  { path: "/(tabs)/communities", label: "Communities tab", defaultCta: "Explore communities" },
  { path: "/community/memberships", label: "My communities", defaultCta: "My communities" },
  { path: "/community/loans", label: "Community loans", defaultCta: "See loans" },
  { path: "/community/contributions-select", label: "Community contributions", defaultCta: "Contribute" },
  { path: "/kyc", label: "Identity verification (KYC)", defaultCta: "Verify now" },
  { path: "/transactions", label: "Transaction history", defaultCta: "View transactions" },
];

export const FALLBACK_AUDIENCES: AudiencePreset[] = [
  { key: "all", label: "All users" },
  { key: "no_ajo", label: "Users not in any Ajo group" },
  { key: "tier0", label: "Unverified users (Tier 0)" },
  { key: "new_users", label: "Joined in the last 30 days" },
  { key: "no_community", label: "Users not in any community" },
  { key: "dormant", label: "No transaction in the last 90 days" },
];

/** Mirrors the theme colours the mobile carousel renders. */
export const BANNER_THEMES: Record<string, string> = {
  navy: "bg-slate-950 text-white",
  blue: "bg-[#2563EB] text-white",
  light: "bg-blue-50 text-slate-900",
};
