'use client';

import Link from 'next/link';
import { Fragment, useState } from 'react';
import type { DayClass, DayCourse } from '@/features/attendance/day-classes';

const COLOR: Record<DayCourse['state'], string> = {
  done: 'var(--color-success)',
  missed: 'var(--color-warning)',
  now: 'var(--color-brand)',
  later: 'var(--border)',
};
const STATE_LABEL: Record<DayCourse['state'], string> = {
  done: '✓ appel fait',
  missed: '⚠ terminé sans appel',
  now: 'en cours',
  later: 'plus tard',
};
const soft = (v: string) => `color-mix(in srgb, ${v} 14%, transparent)`;
const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

function Pill({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold" style={{ backgroundColor: soft(color), color }}>
      {children}
    </span>
  );
}

/**
 * Présences du jour, une ligne par classe (maquette validée le 2026-10-30) :
 * « 2 / 6 » cours passés, une frise d'une pastille par cours (deux fois plus
 * large pour un cours de 2 h), l'état de l'appel, les absents et retards, et la
 * journée détaillée sous la ligne.
 */
export function DayClassTable({ classes, base }: { classes: DayClass[]; base: string }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="overflow-x-auto rounded-2xl border" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface)' }}>
      <table className="w-full min-w-[820px] border-collapse text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-[color:var(--muted-foreground)]" style={{ backgroundColor: 'var(--muted)' }}>
            <th className="px-4 py-2.5">Classe</th>
            <th className="px-4 py-2.5">Journée de la classe</th>
            <th className="px-4 py-2.5">Élèves absents</th>
            <th className="px-4 py-2.5">En retard</th>
            <th className="px-4 py-2.5">Cours en ce moment</th>
            <th className="px-4 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {classes.map((c) => {
            const passed = c.courses.filter((k) => k.ended).length;
            const current = c.courses.find((k) => !k.ended && (k.state === 'now' || k.state === 'done'));
            const later = c.courses.filter((k) => k.state === 'later').length;
            const missed = c.courses.filter((k) => k.state === 'missed').length;
            const long = c.courses.filter((k) => k.hours > 1).length;
            const isOpen = open.has(c.id);
            return (
              <Fragment key={c.id}>
                <tr className="border-t align-top" style={{ borderColor: 'var(--border)' }}>
                  <td className="px-4 py-2.5 font-bold">{c.name}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <b className="text-[15px] tabular-nums">
                        {passed} / {c.courses.length}
                      </b>
                      <span className="flex items-center gap-[3px]" aria-hidden>
                        {c.courses.map((k) => (
                          <i
                            key={k.id}
                            title={`${k.start}–${k.end} ${k.subject}${k.hours > 1 ? ` (${k.hours} h)` : ''}`}
                            className="inline-block h-3.5 rounded"
                            style={{ width: `${14 * k.hours + 3 * (k.hours - 1)}px`, backgroundColor: COLOR[k.state] }}
                          />
                        ))}
                      </span>
                    </div>
                    <div className="text-xs text-[color:var(--muted-foreground)]">
                      {plural(passed, 'cours passé', 'cours passés')} · {current ? '1 en cours' : 'aucun en cours'} · {later} plus tard
                      {long ? ` · dont ${plural(long, 'cours', 'cours')} de plusieurs heures` : ''}
                    </div>
                    <div className="mt-1">
                      {missed > 0 ? (
                        <Pill color="var(--color-warning)">⚠ {plural(missed, 'cours terminé', 'cours terminés')} sans appel</Pill>
                      ) : passed > 0 ? (
                        <Pill color="var(--color-success)">✓ appel fait à chaque cours passé</Pill>
                      ) : (
                        <span className="text-xs text-[color:var(--muted-foreground)]">aucun cours terminé</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    {c.absent > 0 ? (
                      <Pill color="var(--color-danger)">
                        {plural(c.absent, 'élève', 'élèves')}
                        {c.excused ? `, dont ${c.excused} excusé${c.excused > 1 ? 's' : ''}` : ''}
                      </Pill>
                    ) : (
                      <span className="text-[color:var(--muted-foreground)]">aucun</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">{c.late > 0 ? plural(c.late, 'élève', 'élèves') : <span className="text-[color:var(--muted-foreground)]">aucun</span>}</td>
                  <td className="px-4 py-2.5">
                    {current ? (
                      <>
                        {current.subject}{' '}
                        <span className="text-xs text-[color:var(--muted-foreground)]">
                          · {current.start}–{current.end}
                          {current.hours > 1 ? ` (${current.hours} h)` : ''}
                        </span>
                      </>
                    ) : (
                      <span className="text-[color:var(--muted-foreground)]">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => toggle(c.id)}
                      aria-expanded={isOpen}
                      className="whitespace-nowrap rounded-xl border px-3 py-1.5 text-sm font-semibold"
                      style={{ borderColor: 'var(--border)' }}
                    >
                      {isOpen ? 'Masquer ▾' : 'Voir la journée ▸'}
                    </button>
                  </td>
                </tr>
                {isOpen ? (
                  <tr>
                    <td colSpan={6} className="px-0 py-0" style={{ backgroundColor: 'var(--muted)' }}>
                      <table className="w-full text-sm">
                        <tbody>
                          {c.courses.map((k) => (
                            <tr key={k.id} className="border-t border-dashed" style={{ borderColor: 'var(--border)' }}>
                              <td className="py-2 pl-10 pr-3">
                                {k.start}–{k.end} <b>{k.subject}</b>
                                {k.hours > 1 ? (
                                  <span className="ml-2">
                                    <Pill color="var(--color-brand)">{k.hours} h · un seul appel</Pill>
                                  </span>
                                ) : null}
                              </td>
                              <td className="px-3 py-2 text-[color:var(--muted-foreground)]">{k.teacher ?? '—'}</td>
                              <td className="px-3 py-2">
                                <Pill color={k.state === 'later' ? 'var(--muted-foreground)' : COLOR[k.state]}>{STATE_LABEL[k.state]}</Pill>
                              </td>
                              <td className="px-3 py-2 text-right">
                                <Link href={`${base}/${k.id}`} className="text-[color:var(--color-brand)] hover:underline">
                                  Voir
                                </Link>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
