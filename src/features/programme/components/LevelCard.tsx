'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatHours } from '../hours';
import type { LevelProgress } from '../board';

/**
 * Un niveau dans « Matières par niveau ».
 *
 * La carte se déplie pour montrer les matières du niveau — leur coefficient et
 * leur volume horaire — sans quitter la page ni ouvrir l'écran de réglage.
 * Fermée par défaut : une école peut avoir 189 niveaux, on ne déroule pas tout.
 */
export function LevelCard({ level, href }: { level: LevelProgress; href: string }) {
  const [open, setOpen] = useState(false);
  const empty = level.subjects === 0;
  const panelId = `programme-${level.levelId}`;

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="font-semibold">
              {level.name}{' '}
              <span className="font-mono text-xs font-normal text-[color:var(--muted-foreground)]">{level.code}</span>
              {level.diploma ? (
                <span
                  className="ml-2 rounded-full px-2 py-0.5 text-[11px] font-bold"
                  style={{ backgroundColor: 'var(--color-brand-muted)' }}
                >
                  {level.diploma}
                </span>
              ) : null}
            </p>
            {empty ? (
              <p className="text-sm font-semibold" style={{ color: 'var(--color-danger)' }}>
                Aucune matière au programme — à configurer
              </p>
            ) : (
              <p className="text-sm text-[color:var(--muted-foreground)]">
                {level.subjects} matière{level.subjects > 1 ? 's' : ''} · coefficient total {level.totalCoefficient} ·{' '}
                {level.classes === 0 ? (
                  <span style={{ color: 'var(--color-warning)' }}>aucune classe créée</span>
                ) : (
                  `${level.classes} classe${level.classes > 1 ? 's' : ''}`
                )}
              </p>
            )}
          </div>

          <Link href={href}>
            <Button variant={empty ? 'primary' : 'secondary'}>{empty ? 'Configurer' : 'Modifier les matières'}</Button>
          </Link>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls={panelId}
            aria-label={open ? `Replier ${level.name}` : `Voir les matières de ${level.name}`}
            className="grid size-9 shrink-0 place-items-center rounded-full border transition-colors"
            style={{ backgroundColor: 'var(--surface)' }}
          >
            <ChevronDown className={`size-4 transition-transform${open ? ' rotate-180' : ''}`} aria-hidden />
          </button>
        </div>

        {open ? (
          <div id={panelId} className="border-t px-4 py-3">
            {empty ? (
              <p className="text-sm text-[color:var(--muted-foreground)]">
                Rien au programme pour l’instant. « Configurer » ouvre la liste des matières de cet ordre d’enseignement.
              </p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {level.items.map((i) => (
                  <li
                    key={i.subjectId}
                    className="flex items-center gap-2 rounded-full border py-1 pl-2 pr-3 text-sm"
                    style={{ backgroundColor: 'var(--surface)' }}
                  >
                    <span className="rounded-full px-1.5 py-0.5 font-mono text-[10px] font-bold text-[color:var(--muted-foreground)]" style={{ backgroundColor: 'var(--color-brand-muted)' }}>
                      {i.code}
                    </span>
                    <span className={i.mandatory ? '' : 'italic'}>{i.name}</span>
                    <span
                      className="rounded-full px-1.5 text-xs font-bold tabular-nums"
                      style={{ backgroundColor: 'var(--color-brand)', color: 'var(--color-brand-foreground)' }}
                      title="Coefficient"
                    >
                      {i.coefficient}
                    </span>
                    {i.weeklyMinutes > 0 ? (
                      <span className="text-xs tabular-nums text-[color:var(--muted-foreground)]" title="Volume hebdomadaire">
                        {formatHours(i.weeklyMinutes)}
                      </span>
                    ) : null}
                    {!i.mandatory ? (
                      <span className="text-[10px] font-bold uppercase" style={{ color: 'var(--color-warning)' }}>
                        Fac.
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
