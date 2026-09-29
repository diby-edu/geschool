import Link from 'next/link';
import { MODULE_ICON } from '@/components/layout/nav-modules';
import { MODULE_STYLE, moduleGradient, type ModuleKey } from '@/lib/modules';
import type { StaffOverview } from '../types';
import { BlocHead, Meter, Pill, Ring, fr, pct, plural } from './ui';

const CONTRACT_PLURAL: Record<string, string> = { PERMANENT: 'permanents', CONTRACT: 'contractuels', HOURLY: 'vacataires', INTERN: 'stagiaires', OTHER: 'autres' };

function Block({ module, title, href, children }: { module: ModuleKey; title: string; href: string; children: React.ReactNode }) {
  const s = MODULE_STYLE[module];
  const Icon = MODULE_ICON[module];
  const amber = module === 'acces';
  return (
    <Link
      href={href}
      className="flex min-h-[15rem] min-w-0 flex-col justify-between gap-3 rounded-[1.6rem] p-5 shadow-sm transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 motion-reduce:transition-none motion-reduce:hover:transform-none"
      style={{ background: moduleGradient(module), color: s.onBlock }}
    >
      <div className="flex items-center justify-between">
        <span className={`text-[15px] ${amber ? 'font-bold' : 'font-semibold'}`}>{title}</span>
        <span className="grid h-8 w-8 place-items-center rounded-xl" style={{ backgroundColor: amber ? 'rgba(43,26,0,0.12)' : 'rgba(255,255,255,0.2)' }}>
          <Icon className="h-[17px] w-[17px]" aria-hidden />
        </span>
      </div>
      {children}
    </Link>
  );
}

const Big = ({ children }: { children: React.ReactNode }) => <div className="text-[3.4rem] font-extrabold leading-none tracking-tight tabular-nums">{children}</div>;

/** Bloc 3 — Statistiques actuelles : élèves, accès des parents, enseignants, personnel. Une carte n'apparaît que si la personne a le droit d'en voir les chiffres. */
export function StatsBlock({ o, base }: { o: StaffOverview; base: string }) {
  const { students, capacity, parents, teachers, personnel } = o;
  if (!students && !parents && !teachers && !personnel) return null;
  return (
    <section className="space-y-3">
      <BlocHead title="Statistiques actuelles" sub="Élèves, accès des parents, enseignants et personnel" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {students ? (
          <Block module="eleves" title="Élèves" href={`${base}/students`}>
            <div className="space-y-2">
              <Big>{fr(students.total)}</Big>
              <Pill>{students.new30d > 0 ? `+${fr(students.new30d)} ${plural(students.new30d, 'inscription', 'inscriptions')} ces 30 jours` : 'Aucune inscription ces 30 jours'}</Pill>
            </div>
            {capacity ? (
              <div className="space-y-1.5">
                <Meter percent={pct(capacity.enrolled, capacity.capacity) ?? 0} />
                <div className="flex justify-between text-xs">
                  <span>Places occupées</span>
                  <b className="tabular-nums">{fr(capacity.enrolled)} / {fr(capacity.capacity)}</b>
                </div>
              </div>
            ) : (
              <p className="text-xs">Aucune capacité renseignée sur les classes.</p>
            )}
          </Block>
        ) : null}

        {parents ? (
          <Block module="acces" title="Gestion des accès" href={`${base}/access?kind=GUARDIAN`}>
            {parents.total > 0 ? (
              <div className="flex items-center gap-3.5">
                <Ring percent={pct(parents.activated, parents.total)} label={`${pct(parents.activated, parents.total) ?? 0}%`} sub="parents" dark />
                <div>
                  <p className="text-[15px] font-bold leading-tight">{fr(parents.activated)} {plural(parents.activated, 'parent connecté', 'parents connectés')}</p>
                  <p className="mt-0.5 text-xs">sur {fr(parents.total)} {plural(parents.total, 'compte créé', 'comptes créés')}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm font-semibold">Aucun compte parent n’est encore créé.</p>
            )}
            <div className="flex items-center justify-between rounded-xl px-3 py-2 text-xs font-bold" style={{ backgroundColor: 'rgba(43,26,0,0.12)' }}>
              <span>Comptes à activer</span>
              <span className="tabular-nums">{fr(parents.pending)}</span>
            </div>
          </Block>
        ) : null}

        {teachers ? (
          <Block module="enseignants" title="Enseignants" href={`${base}/teachers`}>
            <div className="space-y-2">
              <Big>{fr(teachers.total)}</Big>
              <Pill>{fr(teachers.withAccess)} {plural(teachers.withAccess, 'accès créé', 'accès créés')}</Pill>
            </div>
            {teachers.total > 0 ? (
              <div className="space-y-1.5">
                <div className="flex h-2.5 gap-1">
                  {teachers.byContract.map((c, i) => (
                    <span key={c.code} className="rounded-full" style={{ width: `${(c.count / teachers.total) * 100}%`, backgroundColor: `rgba(255,255,255,${[1, 0.65, 0.35, 0.5, 0.25][i] ?? 0.3})` }} />
                  ))}
                </div>
                <div className="flex flex-wrap justify-between gap-x-2 text-[11px] font-semibold">
                  {teachers.byContract.map((c) => (
                    <span key={c.code}>{fr(c.count)} {CONTRACT_PLURAL[c.code] ?? c.label.toLowerCase()}</span>
                  ))}
                </div>
              </div>
            ) : null}
          </Block>
        ) : null}

        {personnel ? (
          <Block module="personnel" title="Personnel" href={`${base}/personnel`}>
            <div className="space-y-2">
              <Big>{fr(personnel.total)}</Big>
              <Pill>{fr(personnel.functions)} {plural(personnel.functions, 'fonction', 'fonctions')}</Pill>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {personnel.labels.slice(0, 3).map((l) => (
                <span key={l} className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}>{l}</span>
              ))}
              {personnel.labels.length > 3 ? <span className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}>+ {personnel.labels.length - 3}</span> : null}
            </div>
          </Block>
        ) : null}
      </div>
    </section>
  );
}
