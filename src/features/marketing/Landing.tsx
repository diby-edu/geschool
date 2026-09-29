import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { publicEnv } from '@/lib/env';
import { displayFont, brandSans } from '@/lib/fonts';
import { PARENT_PORTAL_PRICE, TRIAL_DAYS, formatFrancs } from '@/features/onboarding/catalog';
import { SchoolAccessForm } from './components/SchoolAccessForm';
import { LandingMotion } from './components/LandingMotion';
import { HeroCarousel } from './components/HeroCarousel';
import { PricingConfigurator } from './components/PricingConfigurator';
import { InstallButton } from './components/InstallButton';
import { AndroidLogo, InstallScreen, ParentScreen, TeacherScreen } from './visuals';
import '@/app/marketing.css';
import './landing.css';

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {children}
    </svg>
  );
}

function tone(a: string, b: string): CSSProperties {
  return { ['--a' as string]: a, ['--b' as string]: b };
}

/* ------------------------------------------------------------------ Hero */

function DashboardCard() {
  return (
    <div className="lp-tilt">
      <div className="lp-panel">
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
  );
}

function HeroSlide({
  toneClass,
  kicker,
  title,
  lede,
  secondary,
  chip,
  children,
}: {
  toneClass: string;
  kicker: string;
  title: ReactNode;
  lede: string;
  secondary: ReactNode;
  chip?: string;
  children: ReactNode;
}) {
  return (
    <div className={`lp-hs ${toneClass}`}>
      <div className="lp-hs-text">
        <span className="lp-kicker lp-rise">{kicker}</span>
        <h2 className="lp-h1 lp-rise d1">{title}</h2>
        <p className="lp-lede lp-rise d2">{lede}</p>
        <div className="lp-cta-row lp-rise d3">
          <Link href="/inscription" className="mkt-pill lp-glow">Inscrire mon établissement &rarr;</Link>
          {secondary}
        </div>
      </div>
      <div className="lp-hs-visual lp-rise d2">
        <div className="lp-stage" />
        <div className="lp-hs-device">{children}</div>
        {chip ? <div className="lp-chip left">{chip}</div> : null}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- Contenu */

const SERVICES = [
  {
    a: '#4a44e0',
    b: '#8b5cf6',
    tag: 'Gestion scolaire',
    title: 'Emploi du temps',
    text: "Fini le tableau à refaire à la main chaque rentrée : le moteur d'optimisation place chaque cours à votre place.",
    points: ['Aucun conflit de salle, de classe ni d’enseignant', 'Horaires réglables jour par jour', 'Chaque enseignant consulte sa propre grille'],
    icon: <Icon><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /></Icon>,
  },
  {
    a: '#16a06a',
    b: '#12a99b',
    tag: 'Gestion scolaire',
    title: 'Notes & bulletins',
    text: 'Les enseignants saisissent leurs notes une seule fois : moyennes, classements et bulletins se calculent tout seuls.',
    points: ['Moyennes par coefficient et classements', 'Bulletins prêts à imprimer, sans ressaisie', 'Publication aux familles quand vous êtes prêt'],
    icon: <Icon><path d="M4 19V5a2 2 0 0 1 2-2h9l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" /><path d="M8 12h8M8 16h5" /></Icon>,
  },
  {
    a: '#12a99b',
    b: '#4a44e0',
    tag: 'Appel numérique',
    title: 'Présences',
    text: "L'enseignant marque les absents depuis son téléphone en début de séance : plus de cahier d'appel qui se perd.",
    points: ['Appel par séance, en quelques secondes', 'Historique consultable par la direction', 'Absences suivies avec leurs justificatifs'],
    icon: <Icon><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></Icon>,
  },
  {
    a: '#f2a71b',
    b: '#f2711b',
    tag: 'Inclus pour tous',
    title: 'Espace Parent',
    text: 'Chaque famille suit la scolarité de son enfant sans passer par l’administration, et vous ne payez rien pour cela.',
    points: ['Notes, présences et bulletins de l’enfant', 'Notification dès qu’une absence est enregistrée', `${formatFrancs(PARENT_PORTAL_PRICE)}/an, réglés par la famille elle-même`],
    icon: <Icon><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9.5" r="2.4" /><path d="M3 20a6 6 0 0 1 12 0M15.5 20a4.5 4.5 0 0 1 6 0" /></Icon>,
  },
  {
    a: '#8b5cf6',
    b: '#4a44e0',
    tag: 'Gestion scolaire',
    title: 'Communication',
    text: 'La bonne information arrive à la bonne personne, sans appels en cascade ni affichage qui passe inaperçu.',
    points: ['Annonces à tout ou partie de l’établissement', 'Notifications directement dans l’application', 'Identifiants de connexion envoyés par SMS'],
    icon: <Icon><path d="M3 8l9 6 9-6" /><rect x="3" y="5" width="18" height="14" rx="2" /></Icon>,
  },
  {
    a: '#f2711b',
    b: '#f2a71b',
    tag: 'Gestion scolaire',
    title: 'Assistant IA',
    text: "Une appréciation de bulletin est proposée à partir des notes de l'élève, pour gagner du temps en fin de trimestre.",
    points: ['Suggestion fondée sur les résultats réels', 'Toujours relue et validée par l’enseignant', 'Rien n’est publié sans son accord'],
    icon: <Icon><path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8" /></Icon>,
  },
];

const DAY = [
  { time: '07:15', title: "Le portail s'ouvre", text: 'Chaque enseignant marque sa classe présente en quelques secondes depuis son téléphone.', tag: 'Appel numérique' },
  { time: '09:40', title: 'Une absence signalée', text: "Le parent est notifié dès que l'absence est enregistrée, sans attendre le lendemain.", tag: 'Espace Parent' },
  { time: '11:00', title: 'Emploi du temps sans conflit', text: 'Aucune salle double-réservée, aucun professeur à deux endroits à la fois.', tag: 'Emploi du temps' },
  { time: '14:30', title: 'Une évaluation notée', text: 'Les notes saisies mettent à jour moyennes et classements instantanément.', tag: 'Notes & bulletins' },
  { time: '17:00', title: 'Le bulletin part au parent', text: 'Prêt à imprimer, ou consultable directement depuis son espace.', tag: 'Notes & bulletins' },
];

const PARENT_STEPS = [
  { title: "L'établissement inscrit l'élève", text: "Le responsable saisit la fiche de l'élève et de ses parents." },
  { title: 'La famille reçoit ses accès', text: 'Ses identifiants arrivent par SMS ; elle choisit son mot de passe à la première connexion.' },
  { title: 'Elle suit son enfant', text: 'Notes, présences et bulletins, avec une notification en cas d’absence.' },
];

const CONTEXT_ITEMS = ['Direction', 'Enseignants', 'Parents', 'Espace Parent inclus', 'Connexion par code école', 'Franc CFA'];
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
            <a href="#parents">Espace Parent</a>
            <a href="#tarifs">Tarifs</a>
            <a href="#install">Installer</a>
            <Link href="/login" className="mkt-pill">Se connecter</Link>
          </div>
        </div>
      </nav>

      <header className="lp-hero">
        <div className="lp-spotlight" aria-hidden="true" />
        <div className="lp-aurora" aria-hidden="true"><i /><i /><i /></div>
        <h1 className="lp-sr">Gestion scolaire en ligne pour les établissements ivoiriens</h1>
        <div className="lp-wrap">
          <HeroCarousel labels={['Direction', 'Enseignants', 'Parents']}>
            <HeroSlide
              toneClass="tone-brand"
              kicker="Pour la direction"
              title={<>Toute votre école, <em>pilotée en temps réel.</em></>}
              lede="Effectifs, présence, moyennes et bulletins : un tableau de bord qui se met à jour tout seul dès que vos équipes saisissent."
              secondary={<a href="#tarifs" className="mkt-ghost">Voir les tarifs</a>}
            >
              <DashboardCard />
            </HeroSlide>

            <HeroSlide
              toneClass="tone-teal"
              kicker="Pour les enseignants"
              title={<>L&apos;appel en <em>quelques secondes</em>, depuis votre téléphone.</>}
              lede="Marquez les absents, saisissez vos notes, retrouvez vos classes et votre emploi du temps. Plus de cahier qui se perd."
              secondary={<a href="#acces" className="mkt-ghost">Accéder à mon établissement</a>}
              chip="✓ Appel validé · 6ème A"
            >
              <div className="lp-tilt"><TeacherScreen /></div>
            </HeroSlide>

            <HeroSlide
              toneClass="tone-amber"
              kicker="Pour les parents"
              title={<>Suivez la scolarité de votre enfant, <em>sans attendre le bulletin.</em></>}
              lede="Notes, présences et bulletins dans votre poche, et une notification dès qu’une absence est enregistrée."
              secondary={<a href="#parents" className="mkt-ghost">Découvrir l&apos;Espace Parent</a>}
              chip="Notification envoyée"
            >
              <div className="lp-tilt"><ParentScreen /></div>
            </HeroSlide>

          </HeroCarousel>

          <ul className="lp-trust lp-rise d4">
            <li><span className="v" data-count="30">30</span><span className="k">jours d&apos;essai gratuit, sans carte bancaire</span></li>
            <li><span className="v" data-count="3">3</span><span className="k">étapes pour inscrire votre établissement</span></li>
            <li><span className="v">0 F</span><span className="k">à payer pour l&apos;Espace Parent</span></li>
          </ul>
          <p className="lp-fineprint lp-rise d4">
            Seul le responsable de l&apos;établissement s&apos;inscrit. Enseignants et parents reçoivent leurs accès de leur établissement.
          </p>
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
            <span className="lp-eyebrow lp-reveal">Ce que vous obtenez</span>
            <h2 className="lp-reveal d1">Tout ce qu&apos;il faut à une école, dans un seul espace.</h2>
            <p className="lp-sub lp-reveal d2">Six services qui se renforcent les uns les autres. Chaque carte indique le module qui la porte.</p>
            <div className="lp-svc-grid">
              {SERVICES.map((s, i) => (
                <article className={`lp-svc lp-reveal d${(i % 3) + 1}`} style={tone(s.a, s.b)} key={s.title}>
                  <span className="tag">{s.tag}</span>
                  <div className="ic">{s.icon}</div>
                  <h3>{s.title}</h3>
                  <p className="desc">{s.text}</p>
                  <ul>
                    {s.points.map((p) => (
                      <li key={p}><i aria-hidden="true">✓</i>{p}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="lp-section" id="parents" style={{ paddingTop: '1rem' }}>
          <div className="lp-wrap">
            <div className="lp-parent-sec">
              <div className="txt">
                <span className="lp-eyebrow lp-reveal" style={{ color: 'var(--lp-amber-text)' }}>Espace Parent</span>
                <h2 className="lp-reveal d1">Les familles suivent leur enfant. Vous ne payez rien.</h2>
                <p className="lp-sub lp-reveal d2">
                  L&apos;Espace Parent est inclus dans toutes les inscriptions. Les familles trouvent elles-mêmes les
                  informations qui saturaient votre accueil, et c&apos;est la famille qui finance son accès.
                </p>

                <ol className="lp-steps lp-reveal d2">
                  {PARENT_STEPS.map((s, i) => (
                    <li key={s.title}>
                      <span className="n">{i + 1}</span>
                      <span className="t"><b>{s.title}</b><span>{s.text}</span></span>
                    </li>
                  ))}
                </ol>

                <div className="lp-priceline lp-reveal d3">
                  <span className="amt">{formatFrancs(PARENT_PORTAL_PRICE)}<small> / an</small></span>
                  <span className="who">par famille, réglés directement en Mobile Money.<br /><b>0 F pour l&apos;établissement.</b></span>
                </div>
              </div>
              <div className="vis lp-reveal d2">
                <div className="lp-stage" />
                <div className="lp-hs-device"><div className="lp-tilt"><ParentScreen /></div></div>
                <div className="lp-chip left">Absence · 09:40</div>
              </div>
            </div>
          </div>
        </section>

        <section className="lp-section" id="tarifs">
          <div className="lp-wrap">
            <span className="lp-eyebrow lp-reveal">Tarification</span>
            <h2 className="lp-reveal d1">Choisissez vos modules, voyez le total.</h2>
            <p className="lp-sub lp-reveal d2">Deux modules indépendants, facturés à l&apos;année, et l&apos;Espace Parent offert. Vous ne payez que ce que vous activez.</p>
            <span className="lp-trial lp-reveal d2">{TRIAL_DAYS} jours gratuits sur tous les modules choisis &mdash; aucune carte bancaire requise</span>
            <PricingConfigurator />
          </div>
        </section>

        <section className="lp-section" id="install" style={{ paddingTop: '1rem' }}>
          <div className="lp-wrap">
            <div className="lp-install">
              <div className="txt lp-reveal">
                <span className="lp-eyebrow">Application mobile</span>
                <h2>Installez l&apos;application sur votre téléphone.</h2>
                <p className="lp-sub">
                  Une icône sur l&apos;écran d&apos;accueil, un lancement en un tapotement, et l&apos;essentiel consultable
                  même quand le réseau est faible.
                </p>
                <ul className="lp-inst-points">
                  <li><i aria-hidden="true">✓</i>Installation directe, sans passer par un store</li>
                  <li><i aria-hidden="true">✓</i>Toujours à jour, sans rien télécharger de plus</li>
                  <li><i aria-hidden="true">✓</i>Gratuite pour tous les profils</li>
                </ul>
                <div className="lp-android">
                  <span className="logo"><AndroidLogo /></span>
                  <span className="lbl"><b>Android</b><small>Installation en un clic</small></span>
                  <InstallButton />
                </div>
                <p className="lp-ios">
                  Sur iPhone : ouvrez le site dans Safari, touchez <b>Partager</b> puis <b>Sur l&apos;écran d&apos;accueil</b>.
                </p>
              </div>
              <div className="vis lp-reveal d2">
                <div className="lp-stage" />
                <div className="lp-hs-device"><InstallScreen /></div>
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
                <p className="lbl">Parent ou enseignant ? Entrez le code de votre établissement.</p>
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
            <a href="#parents">Espace Parent</a>
            <a href="#tarifs">Tarifs</a>
            <a href="#install">Installer</a>
          </div>
        </footer>
      </div>
    </div>
  );
}
