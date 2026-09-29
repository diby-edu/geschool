'use client';

import { Children, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

const AUTOPLAY_MS = 6500;

/**
 * Banniere a defilement horizontal, une diapositive par profil. Le defilement
 * est natif (CSS scroll-snap) : le balayage tactile, le clavier et le rendu
 * sans JavaScript fonctionnent d'office, la premiere diapositive est visible
 * dans le HTML serveur. Le JS ajoute seulement l'avance automatique, les
 * fleches et les points. Aucune avance automatique si l'utilisateur prefere
 * moins de mouvement.
 */
export function HeroCarousel({ children, labels }: { children: ReactNode; labels: string[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const indexRef = useRef(0);
  const pausedRef = useRef(false);
  const [index, setIndex] = useState(0);
  const slides = Children.toArray(children);
  const count = slides.length;

  const goTo = useCallback(
    (i: number) => {
      const el = trackRef.current;
      if (!el) return;
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      el.scrollTo({ left: ((i + count) % count) * el.clientWidth, behavior: reduce ? 'auto' : 'smooth' });
    },
    [count],
  );

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const next = Math.round(el.scrollLeft / el.clientWidth);
        indexRef.current = next;
        setIndex(next);
      });
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const id = window.setInterval(() => {
      if (!pausedRef.current && !document.hidden) goTo(indexRef.current + 1);
    }, AUTOPLAY_MS);
    return () => window.clearInterval(id);
  }, [goTo]);

  const pause = () => {
    pausedRef.current = true;
  };
  const resume = () => {
    pausedRef.current = false;
  };

  return (
    <div
      className="lp-carousel"
      role="region"
      aria-roledescription="carrousel"
      aria-label="Ce que l'application change pour chaque profil"
      onMouseEnter={pause}
      onMouseLeave={resume}
      onFocusCapture={pause}
      onBlurCapture={resume}
      onTouchStart={pause}
      onTouchEnd={() => window.setTimeout(resume, 8000)}
    >
      <div className="lp-slides" ref={trackRef}>
        {slides.map((slide, i) => (
          <div className="lp-slide" key={labels[i] ?? i} role="group" aria-roledescription="diapositive" aria-label={`${labels[i]} (${i + 1} sur ${count})`}>
            {slide}
          </div>
        ))}
      </div>

      <div className="lp-dots">
        <button type="button" className="arrow" aria-label="Diapositive précédente" onClick={() => goTo(index - 1)}>
          &#8592;
        </button>
        {labels.map((label, i) => (
          <button
            key={label}
            type="button"
            className={`dot${i === index ? ' on' : ''}`}
            aria-label={`Afficher : ${label}`}
            aria-current={i === index ? 'true' : undefined}
            onClick={() => goTo(i)}
          >
            <span>{label}</span>
          </button>
        ))}
        <button type="button" className="arrow" aria-label="Diapositive suivante" onClick={() => goTo(index + 1)}>
          &#8594;
        </button>
      </div>
    </div>
  );
}
