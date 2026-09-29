'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Tout le mouvement de la landing, isole ici pour que la page elle-meme reste
 * un composant serveur (HTML complet des le premier octet, indexable, lisible
 * sans JavaScript). Le composant ne rend que la barre de progression et le
 * bouton "retour en haut" ; le reste agit sur le DOM deja rendu :
 *   - .lp-reveal          apparition au defilement
 *   - [data-count]        compteurs (valeur finale deja dans le HTML)
 *   - .lp-day-card        mise en avant de la carte visible dans la frise
 *   - .lp-hero            parallaxe souris + inclinaison du tableau de bord
 * Tout respecte prefers-reduced-motion.
 */

function formatCount(value: number, decimals: number, suffix: string): string {
  return `${value.toLocaleString('fr-FR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix}`;
}

function runCounter(el: HTMLElement): void {
  if (el.dataset.done) return;
  el.dataset.done = '1';
  const target = Number(el.dataset.count);
  const decimals = Number(el.dataset.decimals ?? 0);
  const suffix = el.dataset.suffix ?? '';
  if (!Number.isFinite(target)) return;
  const duration = 1300;
  const start = performance.now();
  const tick = (now: number) => {
    const p = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = formatCount(target * eased, decimals, suffix);
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

export function LandingMotion() {
  const progressRef = useRef<HTMLDivElement>(null);
  const [showTop, setShowTop] = useState(false);

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const cleanups: Array<() => void> = [];

    // Apparition + compteurs
    const targets = document.querySelectorAll<HTMLElement>('.lp-reveal, [data-count]');
    if (reduce) {
      targets.forEach((el) => el.classList.add('in'));
    } else {
      const io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (!e.isIntersecting) continue;
            const el = e.target as HTMLElement;
            el.classList.add('in');
            if (el.dataset.count !== undefined) runCounter(el);
            el.querySelectorAll<HTMLElement>('[data-count]').forEach(runCounter);
            io.unobserve(el);
          }
        },
        { threshold: 0.3 },
      );
      targets.forEach((el) => io.observe(el));
      cleanups.push(() => io.disconnect());
    }

    // Frise "journee type" : la carte visible est mise en avant
    const dayScroll = document.querySelector<HTMLElement>('.lp-day-scroll');
    if (dayScroll && !reduce) {
      const dayIo = new IntersectionObserver(
        (entries) => {
          for (const e of entries) e.target.classList.toggle('active', e.intersectionRatio > 0.6);
        },
        { root: dayScroll, threshold: [0, 0.6, 1] },
      );
      dayScroll.querySelectorAll('.lp-day-card').forEach((c) => dayIo.observe(c));
      cleanups.push(() => dayIo.disconnect());
    }

    // Progression + retour en haut + derive de l'aurore au defilement
    const aurora = document.querySelector<HTMLElement>('.lp-aurora');
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const h = document.documentElement;
        const p = h.scrollTop / (h.scrollHeight - h.clientHeight || 1);
        if (progressRef.current) progressRef.current.style.width = `${p * 100}%`;
        setShowTop(window.scrollY > window.innerHeight * 0.7);
        if (!reduce && aurora) aurora.style.setProperty('--sy2', `${Math.min(60, window.scrollY * 0.08)}px`);
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    cleanups.push(() => {
      window.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    });

    // Souris : parallaxe de l'aurore, halo, inclinaison du tableau de bord
    const hero = document.querySelector<HTMLElement>('.lp-hero');
    const spotlight = document.querySelector<HTMLElement>('.lp-spotlight');
    const tilts = document.querySelectorAll<HTMLElement>('.lp-tilt');
    if (hero && !reduce && finePointer) {
      const onMove = (ev: MouseEvent) => {
        const r = hero.getBoundingClientRect();
        const relX = (ev.clientX - r.left) / r.width;
        const relY = (ev.clientY - r.top) / r.height;
        aurora?.style.setProperty('--mx', `${(relX - 0.5) * 44}px`);
        aurora?.style.setProperty('--my', `${(relY - 0.5) * 44}px`);
        spotlight?.style.setProperty('--sx', `${relX * 100}%`);
        spotlight?.style.setProperty('--sy', `${relY * 100}%`);
        tilts.forEach((tilt) => {
          const pr = tilt.getBoundingClientRect();
          const px = (ev.clientX - pr.left) / pr.width;
          const py = (ev.clientY - pr.top) / pr.height;
          if (px >= -0.2 && px <= 1.2 && py >= -0.2 && py <= 1.2) {
            tilt.style.transform = `perspective(900px) rotateX(${(py - 0.5) * -8}deg) rotateY(${(px - 0.5) * 10}deg)`;
          }
        });
      };
      const onLeave = () => {
        tilts.forEach((tilt) => {
          tilt.style.transform = '';
        });
      };
      hero.addEventListener('mousemove', onMove);
      hero.addEventListener('mouseleave', onLeave);
      cleanups.push(() => {
        hero.removeEventListener('mousemove', onMove);
        hero.removeEventListener('mouseleave', onLeave);
      });
    }

    return () => cleanups.forEach((fn) => fn());
  }, []);

  return (
    <>
      <div className="lp-progress" ref={progressRef} aria-hidden="true" />
      <button
        type="button"
        className={`lp-totop${showTop ? ' show' : ''}`}
        aria-label="Retour en haut de la page"
        tabIndex={showTop ? 0 : -1}
        onClick={() => window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })}
      >
        ↑
      </button>
    </>
  );
}
