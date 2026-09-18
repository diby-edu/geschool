'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { MODULES, PARENT_PORTAL_PRICE, TRIAL_DAYS, formatFrancs } from '@/features/onboarding/catalog';
import { useClientValue } from './useClientValue';

type ModuleCode = (typeof MODULES)[number]['code'];

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

  const total = MODULES.filter((m) => selected.has(m.code)).reduce((sum, m) => sum + m.price, 0);
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
    <div className="lp-price-shell">
      {MODULES.map((m, i) => {
        const active = selected.has(m.code);
        return (
          <div key={m.code} className={`lp-reveal d${i + 1}`}>
            <button
              type="button"
              className={`lp-pmod${active ? ' active' : ''}`}
              aria-pressed={active}
              onClick={() => toggle(m.code)}
            >
              <span className="row">
                <span className="ttl">{m.name}</span>
                <span className="chk" aria-hidden="true">{active ? '✓' : ''}</span>
              </span>
              <span className="dsc">{m.desc}</span>
              <span className="amt">
                {formatFrancs(m.price)} <small>/ an</small>
              </span>
            </button>
          </div>
        );
      })}

      <div className="lp-summary lp-reveal d3" aria-live="polite">
        <h4>Récapitulatif</h4>
        <div className="list">
          {MODULES.filter((m) => selected.has(m.code)).map((m) => (
            <div key={m.code}>
              <span>{m.name}</span>
              <span>{formatFrancs(m.price)}</span>
            </div>
          ))}
        </div>
        <div className="tot">{formatFrancs(shownTotal)}</div>
        <p className="note">Total / an · {TRIAL_DAYS} jours d&apos;essai gratuit avant tout paiement</p>
        <p className="note" style={{ marginTop: '0.8rem' }}>
          + Espace Parent inclus, 0 F pour l&apos;établissement ({formatFrancs(PARENT_PORTAL_PRICE)}/an réglés par chaque famille).
        </p>
        <Link href="/inscription" className="mkt-pill">
          Démarrer l&apos;essai gratuit
        </Link>
      </div>
    </div>
  );
}
