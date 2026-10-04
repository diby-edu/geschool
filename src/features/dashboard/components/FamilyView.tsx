import Link from 'next/link';
import type { TenantContext } from '@/lib/tenant/context';
import { featureEnabled } from '@/lib/modules/features';
import { Flash } from '@/components/ui/flash';
import { formatDate } from '@/features/academic-years/labels';
import { bannerFor } from '../sections';
import type { FamilyOverview } from '../types';
import { WelcomeBanner } from './WelcomeBanner';
import { BlocHead, Card, Pill, SecLabel, Tile, fr, plural } from './ui';

type Sp = Record<string, string | string[] | undefined>;

const score = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 2 });

/**
 * Tableau de bord de l'espace Parent : pour CHAQUE enfant, sa moyenne, ses
 * absences et retards, ses dernières notes publiées et ses bulletins ; puis les
 * annonces destinées aux parents. Les parents n'ont pas de droits réglables :
 * tout est borné par le lien parent–enfant (RLS) et par la publication.
 */
export function FamilyView({ ctx, data, sp }: { ctx: TenantContext; data: FamilyOverview; sp: Sp }) {
  const base = `/e/${ctx.school.slug}`;
  // Une tuile ne mène quelque part que si la page existe pour cette école : un
  // module coupé par la plateforme (0070) rend sa page introuvable, et un
  // chiffre cliquable qui tombe sur un 404 vaut moins qu'un chiffre muet.
  const versNotes = featureEnabled(ctx.disabledFeatures, 'grades');
  const versPresences = featureEnabled(ctx.disabledFeatures, 'attendance');
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Flash searchParams={sp} />
      <h1 className="sr-only">Tableau de bord</h1>
      <WelcomeBanner name={ctx.user.displayName} schoolName={ctx.school.name} {...bannerFor(ctx, data)} />

      {data.unreadNotifications > 0 ? (
        <Card className="flex items-center justify-between py-3">
          <span className="text-sm">
            <strong>{data.unreadNotifications}</strong> notification(s) non lue(s)
          </span>
          <Link href={`${base}/notifications`} className="text-sm font-medium text-[color:var(--color-brand)] hover:underline">
            Consulter
          </Link>
        </Card>
      ) : null}

      <section className="space-y-4">
        <BlocHead title={data.students.length > 1 ? 'Mes enfants' : 'Mon enfant'} sub={ctx.academicYear ? `Année ${ctx.academicYear.name}` : undefined} />
        {data.students.length === 0 ? (
          <Card>
            <p className="text-sm text-[color:var(--muted-foreground)]">Aucun dossier accessible pour le moment. L’établissement doit rattacher votre compte à votre enfant.</p>
          </Card>
        ) : (
          data.students.map((s) => (
            <Card key={s.id}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-lg font-extrabold tracking-tight">{s.name}</h3>
                <span className="text-sm text-[color:var(--muted-foreground)]">
                  {s.className ?? 'Classe non renseignée'} · <span className="font-mono">{s.matricule}</span>
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Tile module="notes" label="Dernière moyenne" value={s.lastAverage !== null ? score(s.lastAverage) : '—'} unit={s.lastAverage !== null ? '/ 20' : undefined} sub={s.lastAverage !== null ? 'Dernier bulletin publié' : 'Aucun bulletin publié'} href={versNotes ? `${base}/mes-notes?enfant=${s.id}` : undefined} min={120} size={32} />
                <Tile module="bulletins" label="Absences" value={fr(s.absences30d)} sub="30 derniers jours" href={versPresences ? `${base}/mes-absences?enfant=${s.id}` : undefined} min={120} size={32} />
                <Tile module="acces" label="Retards" value={fr(s.lates30d)} sub="30 derniers jours" href={versPresences ? `${base}/mes-absences?enfant=${s.id}#retards` : undefined} min={120} size={32} />
                <Tile module="eleves" label="Bulletins" value={fr(s.bulletins)} sub={plural(s.bulletins, 'bulletin publié', 'bulletins publiés')} href={s.bulletins > 0 ? `${base}/mes-bulletins` : undefined} min={120} size={32} />
              </div>

              <div className="mt-4">
                <SecLabel module="notes">Dernières notes</SecLabel>
                {s.lastGrades.length === 0 ? (
                  <p className="mt-2 text-sm text-[color:var(--muted-foreground)]">Aucune note publiée pour le moment.</p>
                ) : (
                  <ul className="mt-2 divide-y" style={{ borderColor: 'var(--border)' }}>
                    {s.lastGrades.map((g, i) => (
                      <li key={`${g.title}-${i}`} className="flex items-center gap-3 py-2">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-bold">{g.subject}</span>
                          <span className="block truncate text-[11px] text-[color:var(--muted-foreground)]">
                            {g.title}
                            {g.date ? ` · ${formatDate(g.date)}` : ''}
                          </span>
                        </span>
                        <Pill tone={g.score / g.max >= 0.5 ? 'good' : 'bad'}>
                          {score(g.score)} / {score(g.max)}
                        </Pill>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Card>
          ))
        )}
      </section>

      {data.announcements.length > 0 ? (
        <section className="space-y-3">
          <BlocHead title="Annonces de l’établissement" />
          <div className="grid gap-3 md:grid-cols-2">
            {data.announcements.map((a) => (
              <Card key={a.id}>
                <SecLabel module="annonces">{a.title}</SecLabel>
                {a.publishedAt ? <p className="mt-1 text-[11px] text-[color:var(--muted-foreground)]">Publiée le {formatDate(a.publishedAt.slice(0, 10))}</p> : null}
                <p className="mt-2 whitespace-pre-line text-sm">{a.excerpt}</p>
              </Card>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
