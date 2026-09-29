'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import Link from 'next/link';
import { MODULES, PARENT_PORTAL_PRICE, TRIAL_DAYS, formatFrancs } from '@/features/onboarding/catalog';
import { useClientValue } from './useClientValue';

type ModuleCode = (typeof MODULES)[number]['code'];

/** Presentation propre a chaque plan (couleurs + pictogramme). Les prix et textes viennent du catalogue. */
const PLAN_LOOK: Record<ModuleCode, { a: string; b: string; icon: ReactNode }> = {
  SCOL: {
    a: '#4a44e0',
    b: '#8b5cf6',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5Z" />
        <path d="M4 5.5v16M9 8h7M9 12h5" />
      </svg>
    ),
  },
  APPEL: {
    a: '#12a99b',
    b: '#16a06a',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="6" y="2.5" width="12" height="19" rx="3" />
        <path d="M9.5 12.5l2 2 3.5-4" />
      </svg>
    ),
  },
};

const PARENT_LOOK = { a: '#f2a71b', b: '#f2711b' };
const PARENT_BENEFITS = [
  'Notes, présences et bulletins de leur enfant',
  'Notification dès qu’une absence est enregistrée',
  'Identifiants reçus par SMS, sans démarche compliquée',
];

function tone(a: string, b: string): CSSProperties {
  return { ['--pa' as string]: a, ['--pb' as string]: b };
}

/** Fait glisser un nombre vers sa nouvelle valeur (sans animation si l'utilisateur la refuse). */
function useAnimatedNumber(target: number): number {
  const reduced = useClientValue(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, false);
  const [value, setValue] = useState(target);
  const current = useRef(target);

  useEffect(() => {
    if (reduced) return;
    const from = current.current;
    const start = performance.now();
    const duration = 450;
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const next = Math.round(from + (target - from) * (1 - Math.pow(1 - p, 3)));
      current.current = next;
      setValue(next);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, reduced]);

  return reduced ? target : value;
}

export function PricingConfigurator() {
  const [selected, setSelected] = useState<ReadonlySet<ModuleCode>>(new Set<ModuleCode>(['SCOL']));

  const chosen = MODULES.filter((m) => selected.has(m.code));
  const total = chosen.reduce((sum, m) => sum + m.price, 0);
  const shownTotal = useAnimatedNumber(total);

  function toggle(code: ModuleCode) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) {
        if (next.size === 1) return prev; // au moins un module
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
  }

  return (
    <>
      <div className="lp-plans">
        {MODULES.map((m, i) => {
          const active = selected.has(m.code);
          const look = PLAN_LOOK[m.code];
          return (
            <div key={m.code} className={`lp-reveal d${i + 1}`}>
              <button
                type="button"
                className={`lp-plan${active ? ' active' : ''}`}
                style={tone(look.a, look.b)}
                aria-pressed={active}
                onClick={() => toggle(m.code)}
              >
                <span className="head">
                  <span className="ico">{look.icon}</span>
                  <span className="nm">{m.name}</span>
                  <span className="price">
                    {formatFrancs(m.price)}
                    <small> / an</small>
                  </span>
                </span>
                <span className="body">
                  <span className="dsc">{m.desc}</span>
                  <span className="list">
                    {m.benefits.map((b) => (
                      <span className="li" key={b}>
                        <i aria-hidden="true">✓</i>
                        {b}
                      </span>
                    ))}
                  </span>
                  <span className="pick">{active ? '✓ Module sélectionné' : 'Ajouter ce module'}</span>
                </span>
              </button>
            </div>
          );
        })}

        <div className="lp-reveal d3">
          <div className="lp-plan always" style={tone(PARENT_LOOK.a, PARENT_LOOK.b)}>
            <span className="head">
              <span className="ico">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="9" cy="8" r="3" />
                  <circle cx="17" cy="9.5" r="2.4" />
                  <path d="M3 20a6 6 0 0 1 12 0M15.5 20a4.5 4.5 0 0 1 6 0" />
                </svg>
              </span>
              <span className="nm">Espace Parent</span>
              <span className="price">
                0 F<small> pour l&apos;école</small>
              </span>
            </span>
            <span className="body">
              <span className="dsc">
                Chaque famille suit son enfant pour <b>{formatFrancs(PARENT_PORTAL_PRICE)}/an</b>, réglés directement par
                elle en Mobile Money.
              </span>
              <span className="list">
                {PARENT_BENEFITS.map((b) => (
                  <span className="li" key={b}>
                    <i aria-hidden="true">✓</i>
                    {b}
                  </span>
                ))}
              </span>
              <span className="pick included">Inclus dans toutes les inscriptions</span>
            </span>
          </div>
        </div>
      </div>

      <div className="lp-summary lp-reveal d2" aria-live="polite">
        <div className="col recap">
          <h4>Votre formule</h4>
          <div className="list">
            {chosen.map((m) => (
              <div key={m.code}>
                <span>{m.name}</span>
                <span>{formatFrancs(m.price)}</span>
              </div>
            ))}
            <div className="free">
              <span>Espace Parent</span>
              <span>0 F</span>
            </div>
          </div>
        </div>
        <div className="col total">
          <span className="lbl">Total / an</span>
          <span className="tot">{formatFrancs(shownTotal)}</span>
          <span className="note">{TRIAL_DAYS} jours d&apos;essai gratuit avant tout paiement</span>
        </div>
        <div className="col go">
          <Link href="/inscription" className="mkt-pill">
            Démarrer l&apos;essai gratuit
          </Link>
          <span className="note">Réservé aux responsables d&apos;établissement</span>
        </div>
      </div>
    </>
  );
}
