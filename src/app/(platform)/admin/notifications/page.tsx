import type { Metadata } from "next";
import Link from "next/link";
import { createClient, getAuthenticatedUser } from "@/lib/supabase/server";
import {
  listPlatformNotifications,
  openPlatformAlerts,
} from "@/features/platform/notifications";
import { markAllPlatformReadAction } from "@/features/platform/notification-actions";
import { mutableTypes } from "@/features/notifications/catalog";
import { PhoneNotifications } from "@/features/notifications/components/PhoneNotifications";
import { vapidPublicKey } from "@/services/push";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Alertes et notifications" };
export const dynamic = "force-dynamic";

/**
 * Alertes et notifications du Super Admin (maquette, parties 2 et 3) : alertes
 * techniques en cours, notifications (paiements, écoles, messages), téléphone.
 * Les urgences partent aussi par SMS (réglages de la page Technique).
 */
/** Catégories (demandé le 2026-10-31) : tout, puis par sujet. */
const CATEGORIES: { key: string; label: string; types: string[] }[] = [
  { key: "tout", label: "Tout", types: [] },
  { key: "alertes", label: "Alertes techniques", types: ["platform.alert"] },
  { key: "paiements", label: "Paiements", types: ["platform.payment"] },
  { key: "ecoles", label: "Écoles", types: ["platform.school"] },
  { key: "messages", label: "Messages", types: ["platform.request"] },
];

export default async function PlatformNotificationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const cat = CATEGORIES.find((c) => c.key === sp.cat) ?? CATEGORIES[0]!;
  const user = await getAuthenticatedUser();
  const supabase = await createClient();
  const [alerts, allNotes, { data: prefs }] = await Promise.all([
    openPlatformAlerts(),
    listPlatformNotifications(user?.id ?? "", 100),
    supabase
      .from("notification_preferences" as never)
      .select("muted")
      .eq("user_id", user?.id ?? "")
      .maybeSingle(),
  ]);
  const notes = cat.types.length
    ? allNotes.filter((n) => cat.types.includes(n.type))
    : allNotes;
  const unread = allNotes.filter((n) => !n.read).length;
  const count = (c: (typeof CATEGORIES)[number]) =>
    (c.types.length
      ? allNotes.filter((n) => c.types.includes(n.type))
      : allNotes
    ).filter((n) => !n.read).length +
    (c.key === "tout" || c.key === "alertes" ? alerts.length : 0);
  const showAlerts = cat.key === "tout" || cat.key === "alertes";
  const kinds = mutableTypes(["platform"]).map(({ type, kind }) => ({
    type,
    label: kind.label,
    icon: kind.icon,
    who: kind.who,
  }));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Alertes et notifications"
        description={`${alerts.length} alerte${alerts.length > 1 ? "s" : ""} en cours · ${unread} notification${unread > 1 ? "s" : ""} non lue${unread > 1 ? "s" : ""}`}
        action={
          unread > 0 ? (
            <form action={markAllPlatformReadAction}>
              <button
                type="submit"
                className="rounded-xl border px-3 py-1.5 text-sm font-semibold"
                style={{ borderColor: "var(--border)" }}
              >
                Tout marquer comme lu
              </button>
            </form>
          ) : null
        }
      />

      <nav aria-label="Catégories" className="flex flex-wrap gap-2">
        {CATEGORIES.map((c) => {
          const n = count(c);
          const on = c.key === cat.key;
          return (
            <Link
              key={c.key}
              href={
                c.key === "tout"
                  ? "/admin/notifications"
                  : `/admin/notifications?cat=${c.key}`
              }
              aria-current={on ? "page" : undefined}
              className="rounded-full border px-3 py-1 text-sm font-semibold"
              style={
                on
                  ? {
                      background: "var(--foreground)",
                      color: "var(--background)",
                      borderColor: "var(--foreground)",
                    }
                  : { borderColor: "var(--border)" }
              }
            >
              {c.label}
              {n > 0 ? (
                <span
                  className="ml-1.5 rounded-full px-1.5 text-xs font-bold text-white"
                  style={{ background: "var(--color-danger)" }}
                >
                  {n}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      {showAlerts ? (
        <section className="space-y-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-[color:var(--muted-foreground)]">
            Alertes techniques en cours
          </h2>
          {alerts.length === 0 ? (
            <Card>
              <CardContent
                className="py-3 text-sm font-semibold"
                style={{ color: "var(--color-success)" }}
              >
                ✓ Tout va bien : aucune alerte.
              </CardContent>
            </Card>
          ) : (
            alerts.map((a) => (
              <Link key={a.key} href={a.href} className="block">
                <Card className="transition hover:shadow-md">
                  <CardContent className="flex items-start gap-3 py-3">
                    <span aria-hidden>{a.icon}</span>
                    <span className="min-w-0 flex-1">
                      <span
                        className="block font-semibold"
                        style={{
                          color:
                            a.tone === "danger"
                              ? "var(--color-danger)"
                              : undefined,
                        }}
                      >
                        {a.title}
                      </span>
                      <span className="block text-sm text-[color:var(--muted-foreground)]">
                        {a.body}
                      </span>
                      <span className="block text-xs text-[color:var(--muted-foreground)]">
                        Depuis {new Date(a.openedAt).toLocaleString("fr-FR")}
                      </span>
                    </span>
                  </CardContent>
                </Card>
              </Link>
            ))
          )}
        </section>
      ) : null}

      <section className="space-y-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-[color:var(--muted-foreground)]">
          {cat.key === "tout" ? "Notifications" : cat.label}
        </h2>
        {notes.length === 0 ? (
          <Card>
            <CardContent className="py-3 text-sm text-[color:var(--muted-foreground)]">
              Aucune notification pour le moment.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="py-1">
              <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
                {notes.map((n) => (
                  <li
                    key={n.id}
                    className={`flex gap-3 py-2.5 text-sm ${n.read ? "opacity-70" : ""}`}
                  >
                    <span aria-hidden>{n.icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 font-semibold">
                        {!n.read ? (
                          <span className="inline-block size-2 rounded-full bg-[color:var(--color-brand)]" />
                        ) : null}
                        {n.title}
                      </span>
                      <span className="block text-[color:var(--muted-foreground)]">
                        {n.body}
                      </span>
                      <span className="block text-xs text-[color:var(--muted-foreground)]">
                        {new Date(n.at).toLocaleString("fr-FR")}
                        {n.href ? (
                          <>
                            {" · "}
                            <Link
                              href={n.href}
                              className="font-semibold text-[color:var(--color-brand)] hover:underline"
                            >
                              Voir
                            </Link>
                          </>
                        ) : null}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </section>

      {cat.key !== "tout" ? null : (
        <section className="space-y-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-[color:var(--muted-foreground)]">
            Sur ce téléphone
          </h2>
          <Card>
            <CardContent className="space-y-3 py-4">
              <p className="text-sm text-[color:var(--muted-foreground)]">
                Alertes et notifications sur votre téléphone, gratuitement. Les
                urgences (site injoignable, worker arrêté, attaque) partent
                aussi par SMS.
              </p>
              <PhoneNotifications
                publicKey={vapidPublicKey()}
                kinds={kinds}
                muted={
                  ((prefs as { muted?: string[] } | null)?.muted ??
                    []) as string[]
                }
              />
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  );
}
