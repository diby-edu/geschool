import Link from 'next/link';
import type { ReactNode } from 'react';
import { publicEnv } from '@/lib/env';
import { displayFont, brandSans } from '@/lib/fonts';
import { TRIAL_DAYS } from '@/features/onboarding/catalog';
import { SchoolAccessForm } from './components/SchoolAccessForm';
import { LandingMotion } from './components/LandingMotion';
import { PricingConfigurator } from './components/PricingConfigurator';
import { InstallButton } from './components/InstallButton';
import '@/app/marketing.css';
import './landing.css';

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {children}
    </svg>
  );
}

const CAPABILITIES = [
  {
    gradient: 'linear-gradient(135deg,#4a44e0,#8b5cf6)',
    title: 'Emploi du temps',
    tag: 'Généré automatiquement',
    text: "Un moteur d'optimisation place chaque cours sans conflit de salle, de classe ni d'enseignant.",
    icon: <Icon><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /></Icon>,
  },
  {
    gradient: 'linear-gradient(135deg,#16a06a,#12a99b)',
    title: 'Notes & bulletins',
    tag: 'Calculs automatiques',
    text: 'Moyennes par coefficient, classements et bulletins générés en un clic, avec appréciations assistées par IA.',
    icon: <Icon><path d="M4 19V5a2 2 0 0 1 2-2h9l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" /><path d="M8 12h8M8 16h5" /></Icon>,
  },
  {
    gradient: 'linear-gradient(135deg,#4a44e0,#12a99b)',
    title: 'Présences',
    tag: 'Sans papier',
    text: "L'appel par séance, les absences notifiées aux parents, les justificatifs suivis au quotidien.",
    icon: <Icon><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></Icon>,
  },
  {
    gradient: 'linear-gradient(135deg,#8b5cf6,#4a44e0)',
    title: 'Communication',
    tag: 'Instantanée',
    text: "Annonces à tout ou partie de l'établissement, notifications, identifiants envoyés par SMS.",
    icon: <Icon><path d="M3 8l9 6 9-6" /><rect x="3" y="5" width="18" height="14" rx="2" /></Icon>,
  },
  {
    gradient: 'linear-gradient(135deg,#f2a71b,#16a06a)',
    title: 'Multi-établissement',
    tag: 'Données cloisonnées',
    text: 'Un compte plateforme pilote plusieurs écoles ; chacune reste totalement cloisonnée des autres.',
    icon: <Icon><circle cx="12" cy="12" r="9" /><path d="M8 12h8M12 8v8" /></Icon>,
  },
  {
    gradient: 'linear-gradient(135deg,#f2a71b,#f2711b)',
    title: 'Assistant IA',
    tag: 'Appréciations suggérées',
    text: "Une appréciation de bulletin proposée à partir des notes de l'élève, toujours relue et validée par l'enseignant.",
    icon: <Icon><path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8" /></Icon>,
  },
];

const DAY = [
  { time: '07:15', title: "Le portail s'ouvre", text: 'Chaque enseignant marque sa classe présente en quelques secondes depuis son téléphone.', tag: 'Appel numérique' },
  { time: '09:40', title: 'Une absence signalée', text: "Le parent est notifié dès que l'absence est enregistrée, sans attendre le lendemain.", tag: 'Communication' },
  { time: '11:00', title: 'Emploi du temps sans conflit', text: 'Aucune salle double-réservée, aucun professeur à deux endroits à la fois.', tag: 'Emploi du temps' },
  { time: '14:30', title: 'Une évaluation notée', text: 'Les notes saisies mettent à jour moyennes et classements instantanément.', tag: 'Notes & bulletins' },
  { time: '17:00', title: 'Le bulletin part au parent', text: 'Prêt à imprimer, ou consultable directement depuis son espace.', tag: 'Notes & bulletins' },
];

const CONTEXT_ITEMS = ['Direction', 'Enseignants', 'Parents', 'Élèves', 'Multi-établissement', 'Franc CFA'];
const BENEFIT_ITEMS = [
  '✓ Sans papier',
  `✓ ${TRIAL_DAYS} jours gratuits`,
  '✓ Données cloisonnées par école',
  '✓ Identifiants par SMS',
  '✓ Consultable hors connexion',
  '✓ Installable sur téléphone',
];

/** Bandeau defilant : la piste est doublee (la copie est masquee aux lecteurs d'ecran) pour une boucle sans saut. */
function Marquee({ items, reverse = false }: { items: string[]; reverse?: boolean }) {
  return (
    <div className={`lp-marquee${reverse ? ' rev' : ''}`}>
      <div className="lp-track">
        {items.map((t) => (
          <span key={t}>{t}</span>
        ))}
        {items.map((t) => (
          <span key={`${t}-copy`} aria-hidden="true">{t}</span>
        ))}
      </div>
    </div>
  );
}

export function Landing() {
  const brand = publicEnv.NEXT_PUBLIC_PLATFORM_NAME;

  return (
    <div className={`mkt lp ${displayFont.variable} ${brandSans.variable}`}>
      <LandingMotion />

      <nav className="lp-nav" aria-label="Navigation principale">
        <div className="lp-nav-in">
          <Link href="/" className="mkt-logo mkt-display">{brand}</Link>
          <div className="lp-nav-links">
            <a href="#modules">Modules</a>
            <a href="#tarifs">Tarifs</a>
            <a href="#install">Installer</a>
            <Link href="/login" className="mkt-pill">Se connecter</Link>
          </div>
        </div>
      </nav>

      <header className="lp-hero">
        <div className="lp-spotlight" aria-hidden="true" />
        <div className="lp-aurora" aria-hidden="true"><i /><i /><i /></div>
        <div className="lp-wrap lp-hero-grid">
          <div>
            <span className="lp-badge lp-rise"><span className="dot" /> Essai gratuit de {TRIAL_DAYS} jours &middot; sans carte bancaire</span>
            <h1
              className="lp-h1 lp-rise d1"
              aria-label="Piloté en temps réel par la direction, les enseignants, les parents et les élèves."
            >
              <span aria-hidden="true">
                Piloté en temps réel par
                <br />
                <span className="lp-rotator">
                  <span>la direction.</span>
                  <span>les enseignants.</span>
                  <span>les parents.</span>
                  <span>les élèves.</span>
                </span>
              </span>
            </h1>
            <p className="lp-lede lp-rise d2">
              Emploi du temps, notes, présences, bulletins et communication réunis dans un seul espace &mdash; pensé pour
              les établissements ivoiriens, du matricule au bulletin en francs CFA.
            </p>
            <div className="lp-cta-row lp-rise d3">
              <Link href="/inscription" className="mkt-pill lp-glow">Inscrire mon établissement &rarr;</Link>
              <a href="#tarifs" className="mkt-ghost">Voir les tarifs</a>
            </div>
            <p className="lp-fineprint lp-rise d3">
              Inscription réservée aux responsables d&apos;établissement &middot; sans engagement.
            </p>
            <div className="lp-stats lp-rise d4">
              <div className="s"><span className="v" data-count="30">30</span><span className="k">jours d&apos;essai gratuit</span></div>
              <div className="s"><span className="v" data-count="3">3</span><span className="k">étapes pour s&apos;inscrire</span></div>
              <div className="s"><span className="v">0 F</span><span className="k">Espace Parent pour l&apos;école</span></div>
            </div>
          </div>

          <div className="lp-tilt">
            <div className="lp-panel lp-rise d2">
              <div className="lp-panel-h">
                <b>Tableau de bord</b>
                <span><i className="lp-livedot" /> Aperçu &middot; données d&apos;exemple</span>
              </div>
              <div className="lp-kpis">
                <div className="lp-kpi"><div className="v" data-count="842">842</div><div className="k">Élèves</div><div className="up">&#9650; 3,2%</div></div>
                <div className="lp-kpi"><div className="v" data-count="95.8" data-decimals="1" data-suffix="%">95,8%</div><div className="k">Présence</div><div className="up">&#9650; 1,1 pt</div></div>
                <div className="lp-kpi"><div className="v" data-count="12.4" data-decimals="1" data-suffix="/20">12,4/20</div><div className="k">Moyenne</div><div className="up">29/31 publiés</div></div>
              </div>
              <div className="lp-chart">
                <div className="ct">Assiduité &mdash; 12 dernières semaines</div>
                <svg className="lp-spark" viewBox="0 0 300 74" width="100%" height="60" preserveAspectRatio="none" aria-hidden="true">
                  <defs>
                    <linearGradient id="lp-grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stopColor="#12a99b" stopOpacity=".35" />
                      <stop offset="1" stopColor="#12a99b" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path className="area" d="M0,50 L25,46 50,48 75,40 100,42 125,32 150,36 175,26 200,30 225,20 250,22 275,14 300,16 L300,74 L0,74 Z" />
                  <path className="line" d="M0,50 L25,46 50,48 75,40 100,42 125,32 150,36 175,26 200,30 225,20 250,22 275,14 300,16" />
                </svg>
              </div>
              <div className="lp-toast" aria-hidden="true"><i /> Absence signalée à la famille</div>
            </div>
          </div>
        </div>
      </header>

      <Marquee items={CONTEXT_ITEMS} />
      <Marquee items={BENEFIT_ITEMS} reverse />

      <main>
        <section className="lp-section" id="journee">
          <div className="lp-wrap">
            <span className="lp-eyebrow lp-reveal">Une journée avec l&apos;application</span>
            <h2 className="lp-reveal d1">De la sonnerie du matin au bulletin publié.</h2>
            <p className="lp-sub lp-reveal d2">Faites glisser pour suivre le fil d&apos;une journée d&apos;école.</p>
            <div className="lp-day-scroll">
              {DAY.map((d, i) => (
                <div className={`lp-day-card lp-reveal d${Math.min(i, 4)}`} key={d.time}>
                  <span className="time">{d.time}</span>
                  <h3>{d.title}</h3>
                  <p>{d.text}</p>
                  <span className="tag">{d.tag}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="lp-section" id="modules">
          <div className="lp-wrap">
            <span className="lp-eyebrow lp-reveal">Modules</span>
            <h2 className="lp-reveal d1">Tout ce qu&apos;il faut à une école, dans un seul espace.</h2>
            <p className="lp-sub lp-reveal d2">Survolez (ou touchez) une carte pour voir ce qu&apos;elle change au quotidien.</p>
            <div className="lp-bento">
              {CAPABILITIES.map((c, i) => (
                <div className={`lp-flip lp-reveal d${(i % 3) + 1}`} key={c.title} tabIndex={0}>
                  <div className="lp-flip-inner">
                    <div className="lp-face front">
                      <div className="ic" style={{ background: c.gradient }}>{c.icon}</div>
                      <div>
                        <h3>{c.title}</h3>
                        <p className="tiny">{c.tag}</p>
                      </div>
                    </div>
                    <div className="lp-face back"><p>{c.text}</p></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="lp-section" id="tarifs">
          <div className="lp-wrap">
            <span className="lp-eyebrow lp-reveal">Tarification</span>
            <h2 className="lp-reveal d1">Cochez vos modules, voyez le total.</h2>
            <p className="lp-sub lp-reveal d2">Deux modules indépendants, facturés à l&apos;année. Vous ne payez que ce que vous activez.</p>
            <span className="lp-trial lp-reveal d2">{TRIAL_DAYS} jours gratuits sur tous les modules choisis &mdash; aucune carte bancaire requise</span>
            <PricingConfigurator />
          </div>
        </section>

        <section className="lp-section" id="install" style={{ paddingTop: '1rem' }}>
          <div className="lp-wrap">
            <div className="lp-install">
              <div className="lp-reveal">
                <span className="lp-eyebrow">Installation</span>
                <h2>Une icône. Un tapotement. Votre école dans la poche.</h2>
                <p className="lp-sub">
                  Installez l&apos;application depuis votre navigateur, sans passer par un store &mdash; l&apos;essentiel reste
                  consultable même sans connexion.
                </p>
                <InstallButton />
              </div>
              <div className="lp-appstrip lp-reveal d2" aria-hidden="true">
                <div className="lp-aicon"><Icon><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /></Icon></div>
                <div className="lp-aicon"><Icon><path d="M3 8l9 6 9-6" /><rect x="3" y="5" width="18" height="14" rx="2" /></Icon></div>
                <div className="lp-aicon drop">GS</div>
                <div className="lp-aicon"><Icon><path d="M4 19V5M4 19h16M8 15v-4M12 15V8M16 15v-6" /></Icon></div>
                <div className="lp-aicon"><Icon><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></Icon></div>
              </div>
            </div>
          </div>
        </section>

        <section className="lp-section" id="acces" style={{ paddingTop: 0 }}>
          <div className="lp-wrap">
            <div className="lp-cta lp-reveal">
              <span className="lp-eyebrow" style={{ color: '#fff2d6' }}>Prêt à démarrer ?</span>
              <h2>Inscrivez votre établissement aujourd&apos;hui.</h2>
              <p className="lp-sub">Trois étapes pour créer votre espace et démarrer votre essai gratuit de {TRIAL_DAYS} jours.</p>
              <div className="lp-cta-actions">
                <Link href="/inscription" className="mkt-pill">Inscrire mon établissement &rarr;</Link>
                <span className="note">Réservé aux responsables d&apos;établissement</span>
              </div>
              <div className="lp-parent">
                <p className="lbl">Parent ou élève ? Retrouvez l&apos;espace de votre établissement.</p>
                <SchoolAccessForm />
              </div>
              <p className="note" style={{ marginTop: '1.2rem' }}>
                Personnel &amp; direction :{' '}
                <Link href="/login" style={{ color: '#fff', textDecoration: 'underline' }}>connexion par e-mail</Link>.
              </p>
            </div>
          </div>
        </section>
      </main>

      <div className="lp-wrap">
        <footer className="mkt-footer">
          <span>&copy; {new Date().getFullYear()} {brand}</span>
          <div className="mkt-footer-links">
            <Link href="/login">Se connecter</Link>
            <a href="#modules">Modules</a>
            <a href="#tarifs">Tarifs</a>
            <a href="#install">Installer</a>
          </div>
        </footer>
      </div>
    </div>
  );
}
