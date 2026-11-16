"use client";

/**
 * The banner composer — grown from the Content & offers modal into a page so
 * the form can sit beside a live preview of what the phone will actually
 * render. The preview mirrors the mobile carousel card (same themes, same
 * headline/button arrangement) inside a mock of the home screen, so marketing
 * sees the banner in context before it exists.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { adminApi } from "@/lib/api";
import {
  BANNER_THEMES,
  FALLBACK_AUDIENCES,
  FALLBACK_DESTINATIONS,
  FALLBACK_PLACEMENTS,
  type AudiencePreset,
  type Destination,
  type Placement,
} from "../../shared";

type Catalogues = {
  placements?: Placement[];
  destinations?: Destination[];
  audiences?: AudiencePreset[];
};

const field = "mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
const select = "mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

export default function NewBannerPage() {
  const router = useRouter();
  const [placements, setPlacements] = useState<Placement[]>(FALLBACK_PLACEMENTS);
  const [destinations, setDestinations] = useState<Destination[]>(FALLBACK_DESTINATIONS);
  const [audiences, setAudiences] = useState<AudiencePreset[]>(FALLBACK_AUDIENCES);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  const [title, setTitle] = useState("");
  const [placement, setPlacement] = useState("home_carousel");
  const [headline, setHeadline] = useState("");
  const [theme, setTheme] = useState("navy");
  const [destination, setDestination] = useState("");
  const [cta, setCta] = useState("");
  // Marketing typed the label themselves at least once; stop prefilling then.
  const [ctaTouched, setCtaTouched] = useState(false);
  const [audienceKey, setAudienceKey] = useState("all");
  const [audienceCustom, setAudienceCustom] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState<"draft" | "publish" | null>(null);
  const [error, setError] = useState("");

  /**
   * Direct-to-Cloudinary, the same path the mobile app uses for its uploads:
   * the API signs, the browser carries the bytes, only the URL comes back.
   */
  async function uploadImage(file: File) {
    setUploading(true);
    setError("");
    try {
      const sig = (await adminApi.bannerUploadSignature()).data;
      const form = new FormData();
      form.append("file", file);
      form.append("api_key", sig.apiKey);
      form.append("timestamp", String(sig.timestamp));
      form.append("signature", sig.signature);
      form.append("folder", sig.folder);
      form.append("public_id", sig.publicId);
      const res = await fetch(sig.uploadUrl, { method: "POST", body: form });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.secure_url) {
        throw new Error(json?.error?.message ?? "The image upload failed");
      }
      setImageUrl(json.secure_url as string);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The image upload failed");
    } finally {
      setUploading(false);
    }
  }

  useEffect(() => {
    adminApi.content().then((r) => {
      const catalogues = r.data as Catalogues;
      if (catalogues.placements?.length) setPlacements(catalogues.placements);
      if (catalogues.destinations?.length) setDestinations(catalogues.destinations);
      if (catalogues.audiences?.length) setAudiences(catalogues.audiences);
    }).catch(() => undefined);
    adminApi.me().then((r) => setIsSuperAdmin(Boolean(r.data?.isSuperAdmin))).catch(() => undefined);
  }, []);

  const save = useCallback(
    async (publish: boolean) => {
      if (!title.trim()) {
        setError("Give the banner a title — it names it in this console.");
        return;
      }
      setBusy(publish ? "publish" : "draft");
      setError("");
      const audienceLabel =
        audienceKey === "custom"
          ? audienceCustom.trim() || "All users"
          : audiences.find((a) => a.key === audienceKey)?.label ?? "All users";
      try {
        const created = await adminApi.createContentItem({
          title: title.trim(),
          type: "IN_APP_BANNER",
          placement,
          body: { headline: headline.trim() || title.trim(), cta: destination ? cta.trim() : "", ctaHref: destination, theme, imageUrl: imageUrl || "" },
          audience: { key: audienceKey, summary: audienceLabel },
          ...(expiresAt ? { expiresAt: new Date(expiresAt).toISOString() } : {}),
        });
        if (publish) {
          const id = (created.data as { id: string }).id;
          await adminApi.decideContent("item", id, { status: "PUBLISHED" });
        }
        router.push("/content");
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not save the banner");
        setBusy(null);
      }
    },
    [title, placement, headline, theme, destination, cta, audienceKey, audienceCustom, expiresAt, imageUrl, audiences, router],
  );

  const chosenPlacement = placements.find((p) => p.slug === placement);
  const previewHeadline = headline.trim() || title.trim() || "Your headline here";

  return (
    <div className="min-w-0 flex-1 bg-[#F8FAFC]">
      <header className="border-b border-[#E3E8F0] bg-white px-4 py-5 sm:px-8">
        <div className="mx-auto flex max-w-[1240px] items-end justify-between gap-4">
          <div>
            <p className="text-xs text-slate-500">
              <Link href="/content" className="font-semibold text-[#012A9D] hover:underline">Content &amp; offers</Link>
              {" / New banner"}
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">New in-app banner</h1>
          </div>
          <Link href="/content" className="text-sm font-semibold text-slate-500 hover:text-slate-800">Cancel</Link>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1240px] gap-6 p-4 sm:p-8 lg:grid-cols-[1fr_400px]">
        <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
          {error && <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

          <div className="space-y-4 text-xs font-medium text-slate-600">
            <label className="block">
              Title (internal — names it in this console)
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="November Ajo push" className={field} />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                Placement
                <select value={placement} onChange={(e) => setPlacement(e.target.value)} className={select}>
                  {placements.map((p) => (
                    <option key={p.slug} value={p.slug}>{p.label}</option>
                  ))}
                </select>
                <span className="mt-1 block text-[10px] font-normal text-slate-400">{chosenPlacement?.surface ?? ""}</span>
              </label>
              <label className="block">
                Theme
                <select value={theme} onChange={(e) => setTheme(e.target.value)} className={select}>
                  <option value="navy">Navy</option>
                  <option value="blue">Blue</option>
                  <option value="light">Light</option>
                </select>
              </label>
            </div>

            <label className="block">
              Headline (what users read)
              <input value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="Start your first Ajo" className={field} />
            </label>

            <div>
              <p>Image (optional — fills the right side of the card)</p>
              <div className="mt-1 flex items-center gap-3">
                {imageUrl ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={imageUrl} alt="Banner" className="h-14 w-24 rounded-lg border border-slate-200 object-cover" />
                    <button onClick={() => setImageUrl("")} className="text-xs font-bold text-red-600 hover:underline">
                      Remove
                    </button>
                  </>
                ) : (
                  <label className={`inline-flex cursor-pointer items-center rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 ${uploading ? "opacity-50" : ""}`}>
                    {uploading ? "Uploading…" : "Upload image"}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      disabled={uploading}
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void uploadImage(file);
                        e.target.value = "";
                      }}
                    />
                  </label>
                )}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                Button opens
                <select
                  value={destination}
                  onChange={(e) => {
                    const next = e.target.value;
                    setDestination(next);
                    // Picking a destination fills the label too; a label
                    // marketing already typed is left alone.
                    if (!ctaTouched) setCta(destinations.find((d) => d.path === next)?.defaultCta ?? "");
                  }}
                  className={select}
                >
                  <option value="">No button</option>
                  {destinations.map((d) => (
                    <option key={d.path} value={d.path}>{d.label}</option>
                  ))}
                </select>
              </label>
              {destination && (
                <label className="block">
                  Button label
                  <input
                    value={cta}
                    onChange={(e) => { setCtaTouched(true); setCta(e.target.value); }}
                    className={field}
                  />
                </label>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                Audience
                <select value={audienceKey} onChange={(e) => setAudienceKey(e.target.value)} className={select}>
                  {audiences.map((a) => (
                    <option key={a.key} value={a.key}>{a.label}</option>
                  ))}
                  <option value="custom">Custom…</option>
                </select>
              </label>
              <label className="block">
                Expires (optional)
                <input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className={field} />
              </label>
            </div>
            {audienceKey === "custom" && (
              <label className="block">
                Describe the audience
                <input value={audienceCustom} onChange={(e) => setAudienceCustom(e.target.value)} placeholder="Users not in any Ajo" className={field} />
              </label>
            )}
          </div>

          <div className="mt-6 flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
            <button
              onClick={() => void save(false)}
              disabled={busy !== null}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {busy === "draft" ? "Saving…" : "Save as draft"}
            </button>
            {isSuperAdmin && (
              <button
                onClick={() => void save(true)}
                disabled={busy !== null}
                className="rounded-xl bg-[#012A9D] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#01208a] disabled:opacity-50"
              >
                {busy === "publish" ? "Publishing…" : "Publish now"}
              </button>
            )}
          </div>
          {!isSuperAdmin && (
            <p className="mt-2 text-right text-[11px] text-slate-400">
              Saved as a draft; the super administrator publishes it.
            </p>
          )}
        </section>

        {/* Live preview — the same card the mobile carousel renders, set
            inside a sketch of the surrounding home screen for scale. */}
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">Preview</p>
          <div className="rounded-[2rem] border-8 border-slate-900 bg-[#F5F7FB] p-3 shadow-xl">
            <div className="mx-auto mb-3 h-1.5 w-16 rounded-full bg-slate-300" />
            {/* Sketched context: greeting + balance card + quick actions. */}
            <div className="mb-3 flex items-center justify-between px-1">
              <div>
                <div className="h-2 w-20 rounded bg-slate-300" />
                <div className="mt-1.5 h-3 w-28 rounded bg-slate-400" />
              </div>
              <div className="h-8 w-8 rounded-full bg-slate-300" />
            </div>
            <div className="mb-3 rounded-2xl bg-slate-900 p-4">
              <div className="h-2 w-16 rounded bg-white/30" />
              <div className="mt-2 h-4 w-28 rounded bg-white/70" />
            </div>
            <div className="mb-3 grid grid-cols-4 gap-2">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="flex flex-col items-center gap-1.5">
                  <div className="h-10 w-10 rounded-xl bg-white shadow-sm" />
                  <div className="h-1.5 w-10 rounded bg-slate-300" />
                </div>
              ))}
            </div>

            {/* The banner itself — mirrors the mobile card: text and a solid
                pill on the left, the image (or soft decorative circles)
                filling the right. */}
            <div className={`relative min-h-[104px] overflow-hidden rounded-2xl p-4 ${BANNER_THEMES[theme] ?? BANNER_THEMES.navy}`}>
              {imageUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={imageUrl} alt="" className="absolute inset-y-0 right-0 w-[42%] object-cover" />
              ) : (
                <>
                  <span className={`absolute -right-6 -top-10 h-28 w-28 rounded-full ${theme === "light" ? "bg-[#2563EB]/10" : "bg-white/10"}`} />
                  <span className={`absolute -bottom-8 right-10 h-20 w-20 rounded-full ${theme === "light" ? "bg-[#2563EB]/5" : "bg-white/5"}`} />
                </>
              )}
              <div className={imageUrl ? "relative w-[58%]" : "relative w-[80%]"}>
                <p className="text-sm font-bold leading-snug">{previewHeadline}</p>
                {destination && cta.trim() && (
                  <span className={`mt-2.5 inline-block rounded-full px-3.5 py-1.5 text-xs font-bold ${theme === "light" ? "bg-[#012A9D] text-white" : "bg-white text-slate-900"}`}>
                    {cta.trim()}
                  </span>
                )}
              </div>
            </div>
            <div className="mt-2 flex justify-center gap-1">
              <span className="h-1.5 w-4 rounded-full bg-[#012A9D]" />
              <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
            </div>

            <div className="mt-3 rounded-2xl bg-white p-4 shadow-sm">
              <div className="h-2 w-24 rounded bg-slate-300" />
              <div className="mt-2 h-2 w-full rounded bg-slate-100" />
              <div className="mt-1.5 h-2 w-3/4 rounded bg-slate-100" />
            </div>
          </div>
          <dl className="mt-3 space-y-1 text-[11px] text-slate-500">
            <div className="flex justify-between gap-2">
              <dt className="font-semibold">Appears</dt>
              <dd className="text-right">{chosenPlacement?.surface ?? placement}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="font-semibold">Audience</dt>
              <dd className="text-right">
                {audienceKey === "custom"
                  ? audienceCustom.trim() || "All users"
                  : audiences.find((a) => a.key === audienceKey)?.label ?? "All users"}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="font-semibold">Button</dt>
              <dd className="text-right">
                {destination ? `${cta.trim() || "—"} → ${destinations.find((d) => d.path === destination)?.label ?? destination}` : "None"}
              </dd>
            </div>
            {expiresAt && (
              <div className="flex justify-between gap-2">
                <dt className="font-semibold">Expires</dt>
                <dd className="text-right">{new Date(expiresAt).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })}</dd>
              </div>
            )}
          </dl>
        </aside>
      </main>
    </div>
  );
}
