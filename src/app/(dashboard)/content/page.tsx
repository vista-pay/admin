"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { adminApi } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { statusBadge } from "@/components/admin/campaign-composer";
import { formatDate } from "@/lib/utils";
import {
  BANNER_THEMES,
  FALLBACK_AUDIENCES,
  FALLBACK_PLACEMENTS,
  type AudiencePreset,
  type Destination,
  type Placement,
} from "./shared";

/**
 * Content & offers — everything the app shows that marketing controls.
 *
 * Four kinds behind four tabs, all versioned and reviewed before publishing:
 * in-app banners, partner offers (with the licence and data-sharing columns a
 * compliance reviewer actually reads), help-centre drafts and message
 * templates. Partner offers carry the hard rule in the subtitle: partners
 * must be licensed for the product they offer, and nothing is shared without
 * opt-in.
 */

type ContentItem = {
  id: string;
  code: string;
  title: string;
  type: "IN_APP_BANNER" | "HELP_ARTICLE" | "MESSAGE_TEMPLATE" | "PARTNER_OFFER";
  placement: string;
  body: { headline?: string; cta?: string; ctaHref?: string; theme?: string; text?: string; imageUrl?: string } | null;
  audience: { summary?: string } | null;
  status: string;
  version: number;
  scheduledAt: string | null;
  expiresAt: string | null;
  rejectionReason: string | null;
  updatedAt: string;
};

type PartnerOffer = {
  id: string;
  code: string;
  title: string;
  description: string;
  partnerName: string;
  placement: string;
  audience: { summary?: string } | null;
  dataShared: string[] | { summary?: string } | null;
  consentRequired: boolean;
  licenceReference: string | null;
  status: string;
  startsAt: string | null;
  endsAt: string | null;
  updatedAt: string;
};

type Payload = {
  items: ContentItem[];
  offers: PartnerOffer[];
  placements?: Placement[];
  destinations?: Destination[];
  audiences?: AudiencePreset[];
};

export default function Page() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState<"BANNERS" | "OFFERS" | "HELP" | "TEMPLATES">("BANNERS");
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [busy, setBusy] = useState(false);
  // Banners grew out of the modal — they compose on their own page with a
  // live preview (/content/banners/new); the three simpler kinds stay here.
  const [creating, setCreating] = useState<null | "offer" | "template" | "article">(null);

  const load = useCallback(() => {
    adminApi
      .content()
      .then((r) => setData(r.data as Payload))
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
    adminApi.me().then((r) => setIsSuperAdmin(Boolean(r.data?.isSuperAdmin))).catch(() => undefined);
  }, [load]);

  const banners = data?.items.filter((i) => i.type === "IN_APP_BANNER") ?? [];
  const placementLabel = (slug: string) =>
    (data?.placements ?? FALLBACK_PLACEMENTS).find((p) => p.slug === slug)?.label ?? slug;
  const articles = data?.items.filter((i) => i.type === "HELP_ARTICLE") ?? [];
  const templates = data?.items.filter((i) => i.type === "MESSAGE_TEMPLATE") ?? [];
  const offers = data?.offers ?? [];

  const act = async (kind: "item" | "offer", id: string, status: string, label: string) => {
    const reason = status === "REJECTED" ? window.prompt("Reason for rejecting (shown to the maker):")?.trim() : undefined;
    if (status === "REJECTED" && (!reason || reason.length < 5)) return;
    setBusy(true);
    setError("");
    try {
      if (status === "PENDING_APPROVAL") await adminApi.submitContent(kind, id);
      else await adminApi.decideContent(kind, id, { status, reason });
      setNotice(`${label} ${status === "PENDING_APPROVAL" ? "submitted for review" : `moved to ${status.toLowerCase().replace(/_/g, " ")}`}.`);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The decision was not recorded");
    } finally {
      setBusy(false);
    }
  };

  /**
   * Who sees which buttons encodes the approval model: ordinary admins draft
   * and submit; the super admin — there is exactly one — decides, including
   * over their own drafts, so they get a one-click "Publish now" instead of
   * walking submit → approve → publish for work only they could approve
   * anyway.
   */
  const itemActions = (item: { id: string; status: string; title: string }, kind: "item" | "offer") => (
    <span className="inline-flex gap-2 text-xs">
      {!isSuperAdmin && (item.status === "DRAFT" || item.status === "REJECTED") && (
        <button disabled={busy} onClick={() => void act(kind, item.id, "PENDING_APPROVAL", item.title)} className="font-bold text-[#012A9D] hover:underline">
          Submit
        </button>
      )}
      {isSuperAdmin && (item.status === "DRAFT" || item.status === "REJECTED" || item.status === "PENDING_APPROVAL" || item.status === "APPROVED") && (
        <button disabled={busy} onClick={() => void act(kind, item.id, "PUBLISHED", item.title)} className="font-bold text-emerald-700 hover:underline">
          Publish now
        </button>
      )}
      {item.status === "PENDING_APPROVAL" && isSuperAdmin && (
        <button disabled={busy} onClick={() => void act(kind, item.id, "REJECTED", item.title)} className="font-bold text-red-600 hover:underline">
          Reject
        </button>
      )}
      {item.status === "PUBLISHED" && isSuperAdmin && (
        <button disabled={busy} onClick={() => void act(kind, item.id, "ARCHIVED", item.title)} className="font-bold text-slate-500 hover:underline">
          Archive
        </button>
      )}
    </span>
  );

  const newButton =
    tab === "OFFERS" ? (
      <Button onClick={() => setCreating("offer")}>+ New partner offer</Button>
    ) : tab === "HELP" ? (
      <Button onClick={() => setCreating("article")}>+ New article draft</Button>
    ) : tab === "TEMPLATES" ? (
      <Button onClick={() => setCreating("template")}>+ New template</Button>
    ) : (
      <Link href="/content/banners/new" className="inline-flex h-10 items-center rounded-xl bg-[#012A9D] px-4 text-sm font-bold text-white hover:bg-[#01208a]">
        + New banner
      </Link>
    );

  const tabs = [
    ["BANNERS", `In-app banners (${banners.length})`],
    ["OFFERS", `Partner offers (${offers.length})`],
    ["HELP", `Help centre (${articles.length})`],
    ["TEMPLATES", `Message templates (${templates.length})`],
  ] as const;

  return (
    <div className="min-w-0 flex-1 bg-[#F8FAFC]">
      <header className="border-b border-[#E3E8F0] bg-white px-4 py-5 sm:px-8">
        <div className="mx-auto flex max-w-[1240px] items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Content &amp; offers</h1>
            <p className="mt-1 text-xs text-slate-500">
              In-app banners, partner offers, help centre and message templates — all versioned and reviewed before
              publishing
            </p>
          </div>
          {newButton}
        </div>
      </header>

      <main className="mx-auto max-w-[1240px] space-y-4 p-4 sm:p-8">
        {error && <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
        {notice && !error && <p className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-700">{notice}</p>}

        <nav className="flex flex-wrap gap-1 border-b border-slate-200">
          {tabs.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`border-b-2 px-3 py-2 text-xs font-bold ${
                tab === key ? "border-[#012A9D] text-[#012A9D]" : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        {!data ? (
          <div className="h-48 animate-pulse rounded-xl bg-slate-200" />
        ) : tab === "BANNERS" ? (
          banners.length === 0 ? (
            <EmptyTab text="No in-app banners yet. Create one — it starts as a draft and is reviewed before users see it." />
          ) : (
            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {banners.map((banner) => (
                <article key={banner.id} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className={`relative min-h-[96px] overflow-hidden rounded-xl p-5 ${BANNER_THEMES[banner.body?.theme ?? "navy"] ?? BANNER_THEMES.navy}`}>
                    {banner.body?.imageUrl && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={banner.body.imageUrl} alt="" className="absolute inset-y-0 right-0 w-[42%] object-cover" />
                    )}
                    <div className={banner.body?.imageUrl ? "relative w-[58%]" : "relative"}>
                      <p className="text-sm font-bold">{banner.body?.headline ?? banner.title}</p>
                      {banner.body?.cta && (
                        <span className={`mt-3 inline-block rounded-full px-3.5 py-1.5 text-xs font-bold ${banner.body?.theme === "light" ? "bg-[#012A9D] text-white" : "bg-white text-slate-900"}`}>
                          {banner.body.cta}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <p className="text-xs font-bold text-slate-900">{placementLabel(banner.placement)}</p>
                    {statusBadge(banner.status)}
                  </div>
                  {banner.status === "PUBLISHED" && (
                    <p className="mt-1 text-[11px] font-semibold text-emerald-700">Live in the app now</p>
                  )}
                  <p className="mt-1 text-[11px] text-slate-500">
                    {banner.audience?.summary ?? "All users"}
                    {banner.expiresAt ? ` · until ${formatDate(banner.expiresAt)}` : ""}
                    {` · v${banner.version}`}
                  </p>
                  {banner.status === "REJECTED" && banner.rejectionReason && (
                    <p className="mt-1 text-[11px] text-red-600">Rejected: {banner.rejectionReason}</p>
                  )}
                  <div className="mt-2">{itemActions(banner, "item")}</div>
                </article>
              ))}
            </section>
          )
        ) : tab === "OFFERS" ? (
          <article className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 p-4">
              <h2 className="text-sm font-bold">Partner offers</h2>
              <p className="text-xs text-slate-400">
                Partners must be licensed for the product they offer; Rendi never shares data without opt-in
              </p>
            </div>
            {offers.length === 0 ? (
              <EmptyTab text="No partner offers yet." plain />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-left uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="p-3 font-semibold">Offer</th>
                      <th className="p-3 font-semibold">Partner</th>
                      <th className="p-3 font-semibold">Shown in</th>
                      <th className="p-3 font-semibold">Data shared</th>
                      <th className="p-3 font-semibold">Licence</th>
                      <th className="p-3 font-semibold">Status</th>
                      <th className="p-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {offers.map((offer) => {
                      const shared = Array.isArray(offer.dataShared)
                        ? offer.dataShared.join(", ") || "None until user applies"
                        : offer.dataShared?.summary ?? "None until user applies";
                      return (
                        <tr key={offer.id} className="border-t border-slate-100">
                          <td className="p-3">
                            <p className="font-semibold text-slate-900">{offer.title}</p>
                            <p className="text-slate-400">{offer.code}</p>
                          </td>
                          <td className="max-w-[160px] truncate p-3 text-slate-600" title={offer.partnerName}>
                            {offer.partnerName}
                          </td>
                          <td className="max-w-[160px] truncate p-3 text-slate-600" title={offer.placement}>
                            {offer.placement}
                          </td>
                          <td className="max-w-[180px] truncate p-3 text-slate-600" title={shared}>
                            {offer.consentRequired ? shared : `${shared} (no opt-in!)`}
                          </td>
                          <td className="p-3">
                            {offer.licenceReference ? (
                              <span className="text-slate-600">{offer.licenceReference}</span>
                            ) : (
                              <span className="font-bold text-red-600">Missing licence</span>
                            )}
                          </td>
                          <td className="p-3">{statusBadge(offer.status)}</td>
                          <td className="p-3 text-right">{itemActions(offer, "offer")}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </article>
        ) : (
          <article className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 p-4">
              <h2 className="text-sm font-bold">{tab === "HELP" ? "Help centre drafts" : "Message templates"}</h2>
              {tab === "HELP" && (
                <p className="mt-0.5 text-xs text-slate-400">
                  Drafts reviewed here; the published help centre is managed with the live articles the app serves.
                </p>
              )}
            </div>
            {(tab === "HELP" ? articles : templates).length === 0 ? (
              <EmptyTab text={tab === "HELP" ? "No help-centre drafts yet." : "No message templates yet."} plain />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-left uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="p-3 font-semibold">Title</th>
                      <th className="p-3 font-semibold">Placement</th>
                      <th className="p-3 font-semibold">Audience</th>
                      <th className="p-3 font-semibold">Version</th>
                      <th className="p-3 font-semibold">Updated</th>
                      <th className="p-3 font-semibold">Status</th>
                      <th className="p-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {(tab === "HELP" ? articles : templates).map((item) => (
                      <tr key={item.id} className="border-t border-slate-100">
                        <td className="p-3">
                          <p className="font-semibold text-slate-900">{item.title}</p>
                          <p className="text-slate-400">{item.code}</p>
                        </td>
                        <td className="p-3 text-slate-600">{item.placement}</td>
                        <td className="p-3 text-slate-600">{item.audience?.summary ?? "All users"}</td>
                        <td className="p-3 tabular-nums">v{item.version}</td>
                        <td className="p-3 tabular-nums text-slate-500">{formatDate(item.updatedAt)}</td>
                        <td className="p-3">{statusBadge(item.status)}</td>
                        <td className="p-3 text-right">{itemActions(item, "item")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </article>
        )}
      </main>

      {creating && (
        <CreateContentModal
          kind={creating}
          placements={data?.placements?.length ? data.placements : FALLBACK_PLACEMENTS}
          audiences={data?.audiences?.length ? data.audiences : FALLBACK_AUDIENCES}
          onClose={() => setCreating(null)}
          onSaved={() => {
            setCreating(null);
            setNotice("Draft created. Submit it for review when it is ready.");
            load();
          }}
        />
      )}
    </div>
  );
}

function EmptyTab({ text, plain }: { text: string; plain?: boolean }) {
  return (
    <div className={plain ? "p-8 text-center text-sm text-slate-400" : "rounded-xl border border-dashed border-slate-300 p-12 text-center text-sm text-slate-400"}>
      {text}
    </div>
  );
}

/**
 * One modal for all four kinds — the fields that differ are few enough that a
 * second page would be ceremony. Everything created here is a DRAFT.
 */
function CreateContentModal({
  kind,
  placements,
  audiences,
  onClose,
  onSaved,
}: {
  kind: "offer" | "template" | "article";
  placements: Placement[];
  audiences: AudiencePreset[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState("");
  // Offers are rendered by an app surface that asks for its placement by
  // slug, so they pick from the catalogue; templates and help articles keep
  // descriptive free text.
  const [placement, setPlacement] = useState(
    kind === "offer" ? "opportunities_tab" : kind === "template" ? "Transactional" : "Help centre",
  );
  // Audience is a preset first, free text only when "Custom…" is chosen.
  const [audienceKey, setAudienceKey] = useState("all");
  const [audienceCustom, setAudienceCustom] = useState("");
  const [body, setBody] = useState("");
  const [partnerName, setPartnerName] = useState("");
  const [description, setDescription] = useState("");
  const [dataShared, setDataShared] = useState("");
  const [licence, setLicence] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    if (!title.trim()) {
      setError("Give it a title.");
      return;
    }
    setBusy(true);
    setError("");
    // `key` is what a future targeting pass will switch on; `summary` is what
    // every list in the console shows today.
    const audienceLabel =
      audienceKey === "custom"
        ? audienceCustom.trim() || "All users"
        : audiences.find((a) => a.key === audienceKey)?.label ?? "All users";
    const audiencePayload = { key: audienceKey, summary: audienceLabel };
    try {
      if (kind === "offer") {
        if (description.trim().length < 5 || !partnerName.trim()) {
          setError("Partner name and a description of at least five characters are required.");
          setBusy(false);
          return;
        }
        await adminApi.createPartnerOffer({
          title: title.trim(),
          description: description.trim(),
          partnerName: partnerName.trim(),
          placement,
          audience: audiencePayload,
          dataShared: dataShared.split(",").map((s) => s.trim()).filter(Boolean),
          consentRequired: true,
          ...(licence.trim() ? { licenceReference: licence.trim() } : {}),
        });
      } else {
        await adminApi.createContentItem({
          title: title.trim(),
          type: kind === "template" ? "MESSAGE_TEMPLATE" : "HELP_ARTICLE",
          placement,
          body: { text: body.trim() },
          audience: audiencePayload,
        });
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the draft");
    } finally {
      setBusy(false);
    }
  };

  const heading =
    kind === "offer" ? "New partner offer" : kind === "template" ? "New message template" : "New help-centre draft";

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 p-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6">
        <h2 className="text-lg font-black">{heading}</h2>
        <p className="mt-1 text-xs text-slate-500">Created as a draft; reviewed before anything is published.</p>
        {error && <p className="mt-3 rounded-lg bg-red-50 p-2 text-xs text-red-700">{error}</p>}
        <div className="mt-4 space-y-3 text-xs font-medium text-slate-600">
          <label className="block">
            Title
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" />
          </label>
          <label className="block">
            {kind === "offer" ? "Shown in" : "Placement"}
            {kind === "offer" ? (
              <>
                <select value={placement} onChange={(e) => setPlacement(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm">
                  {placements.map((p) => (
                    <option key={p.slug} value={p.slug}>{p.label}</option>
                  ))}
                </select>
                <span className="mt-1 block text-[10px] font-normal text-slate-400">
                  {placements.find((p) => p.slug === placement)?.surface ?? ""}
                </span>
              </>
            ) : (
              <input value={placement} onChange={(e) => setPlacement(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" />
            )}
          </label>
          {kind === "offer" && (
            <>
              <label className="block">
                Partner
                <input value={partnerName} onChange={(e) => setPartnerName(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" />
              </label>
              <label className="block">
                Description
                <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 p-3 text-sm" />
              </label>
              <label className="block">
                Data shared with partner (comma-separated; empty = none until the user applies)
                <input value={dataShared} onChange={(e) => setDataShared(e.target.value)} placeholder="Name, phone, category" className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" />
              </label>
              <label className="block">
                Licence reference
                <input value={licence} onChange={(e) => setLicence(e.target.value)} placeholder="NAICOM/XXX/2026" className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" />
              </label>
            </>
          )}
          {(kind === "template" || kind === "article") && (
            <label className="block">
              {kind === "template" ? "Template text" : "Article draft"}
              <textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 p-3 text-sm" />
            </label>
          )}
          <label className="block">
            Audience
            <select value={audienceKey} onChange={(e) => setAudienceKey(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm">
              {audiences.map((a) => (
                <option key={a.key} value={a.key}>{a.label}</option>
              ))}
              <option value="custom">Custom…</option>
            </select>
          </label>
          {audienceKey === "custom" && (
            <label className="block">
              Describe the audience
              <input value={audienceCustom} onChange={(e) => setAudienceCustom(e.target.value)} placeholder="Users not in any Ajo" className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" />
            </label>
          )}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void save()} loading={busy}>
            Create draft
          </Button>
        </div>
      </div>
    </div>
  );
}
