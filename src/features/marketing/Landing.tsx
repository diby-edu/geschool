import Link from 'next/link';
import { publicEnv } from '@/lib/env';
import { displayFont, brandSans } from '@/lib/fonts';
import { SchoolAccessForm } from './components/SchoolAccessForm';
import '@/app/marketing.css';

const MODULES = [
  {
    gradient: 'linear-gradient(135deg,#4a44e0,#8b5cf6)',
    title: 'Emploi du temps automatique',
    text: "Un moteur d'optimisation place chaque cours sans conflit de salle, de classe ni d'enseignant.",
    icon: (
      <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /></svg>
    ),
  },
  {
    gradient: 'linear-gradient(135deg,#16a06a,#12a99b)',
    title: 'Notes & bulletins',
    text: 'Moyennes par coefficient, classements et bulletins generes en un clic, avec appreciations assistees par IA.',
    icon: (
      <svg viewBox="0 0 24 24"><path d="M4 19V5a2 2 0 0 1 2-2h9l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" /><path d="M8 12h8M8 16h5" /></svg>
    ),
  },
  {
    gradient: 'linear-gradient(135deg,#4a44e0,#12a99b)',
    title: 'Presences & justificatifs',
    text: "L'appel par seance, les absences notifiees aux parents, les justificatifs suivis au quotidien.",
    icon: (
      <svg viewBox="0 0 24 24"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>
    ),
  },
  {
    gradient: 'linear-gradient(135deg,#8b5cf6,#4a44e0)',
    title: 'Communication',
    text: 'Annonces a tout ou partie de l’etablissement, notifications, identifiants envoyes par SMS.',
    icon: (
      <svg viewBox="0 0 24 24"><path d="M3 8l9 6 9-6" /><rect x="3" y="5" width="18" height="14" rx="2" /></svg>
    ),
  },
  {
    gradient: 'linear-gradient(135deg,#f2a71b,#16a06a)',
    title: 'Multi-etablissement',
    text: 'Un compte plateforme pilote plusieurs ecoles ; chacune reste totalement cloisonnee des autres.',
    icon: (
      <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M8 12h8M12 8v8" /></svg>
    ),
  },
  {
    gradient: 'linear-gradient(135deg,#f2a71b,#f2711b)',
    title: 'Assistant IA',
    text: "Une appreciation de bulletin proposee a partir des notes de l'eleve, toujours relue et validee par l'enseignant.",
    icon: (
      <svg viewBox="0 0 24 24"><path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8" /></svg>
    ),
  },
];

const ROLES = [
  { label: 'Direction', initial: 'D', color: '#4a44e0' },
  { label: 'Enseignants', initial: 'E', color: '#16a06a' },
  { label: 'Parents', initial: 'P', color: '#f2a71b' },
  { label: 'Eleves', initial: 'E', color: '#ff6a5a' },
];

export function Landing() {
  const brand = publicEnv.NEXT_PUBLIC_PLATFORM_NAME;

  return (
    <div className={`mkt ${displayFont.variable} ${brandSans.variable}`}>
      <div className="mkt-aurora"><i /><i /><i /><i /></div>
      <div className="mkt-z">
        <nav className="mkt-nav">
          <span className="mkt-logo mkt-display">{brand}</span>
          <div className="mkt-nav-links">
            <a href="#modules">Modules</a>
            <a href="#acces">Parents &amp; eleves</a>
            <Link href="/login" className="mkt-pill">Se connecter</Link>
          </div>
        </nav>

        <div className="mkt-wrap">
          <section className="mkt-hero">
            <div>
              <span className="mkt-badge mkt-fade d1">
                <span className="mkt-dot" /> Multi-etablissement &middot; donnees cloisonnees par ecole
              </span>
              <h1 className="mkt-fade d2">
                Toute votre ecole, <span className="mkt-grad">pilotee en temps reel.</span>
              </h1>
              <p className="mkt-lede mkt-fade d3">
                Emploi du temps, notes, presences, bulletins et communication reunis dans un seul
                espace &mdash; pense pour les etablissements ivoiriens, du matricule au bulletin en
                francs CFA.
              </p>
              <div className="mkt-hero-cta mkt-fade d4">
                <Link href="/login" className="mkt-pill">Se connecter</Link>
                <a href="#acces" className="mkt-ghost">Espace parents &amp; eleves</a>
              </div>
            </div>

            <div className="mkt-fade d3">
              <div className="mkt-panel">
                <div className="mkt-panel-h">
                  <b className="mkt-display">Tableau de bord</b>
                  <span>Exemple &middot; trimestre 1</span>
                </div>
                <div className="mkt-kpis">
                  <div className="mkt-kpi"><div className="v">842</div><div className="k">Eleves</div><div className="up">&#9650; 3,2%</div></div>
                  <div className="mkt-kpi"><div className="v">95,8%</div><div className="k">Presence</div><div className="up">&#9650; 1,1 pt</div></div>
                  <div className="mkt-kpi"><div className="v">12,4</div><div className="k">Moyenne /20</div><div className="up">29/31 publies</div></div>
                </div>
                <div className="mkt-chartbox">
                  <div className="ct">Assiduite &mdash; 12 dernieres semaines</div>
                  <svg className="mkt-spark" viewBox="0 0 300 74" width="100%" height="66" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="mktgrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stopColor="#12a99b" stopOpacity=".35" />
                        <stop offset="1" stopColor="#12a99b" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path className="area" d="M0,50 L25,46 50,48 75,40 100,42 125,32 150,36 175,26 200,30 225,20 250,22 275,14 300,16 L300,74 L0,74 Z" />
                    <path className="line" d="M0,50 L25,46 50,48 75,40 100,42 125,32 150,36 175,26 200,30 225,20 250,22 275,14 300,16" />
                    <circle cx="300" cy="16" r="3.5" />
                  </svg>
                </div>
              </div>
            </div>
          </section>

          <section className="mkt-fgrid mkt-fade d5" style={{ padding: '0.6rem 0 2.6rem', gridTemplateColumns: 'repeat(3, 1fr)', display: 'grid', gap: '1rem' }}>
            <div className="mkt-fc" style={{ padding: '1rem 1.2rem' }}>
              <p style={{ margin: 0, fontWeight: 700, fontSize: '.92rem' }}>Donnees cloisonnees</p>
              <p style={{ margin: '.3rem 0 0', color: 'var(--mkt-muted)', fontSize: '.85rem' }}>Chaque etablissement n&apos;a jamais acces aux donnees d&apos;un autre.</p>
            </div>
            <div className="mkt-fc" style={{ padding: '1rem 1.2rem' }}>
              <p style={{ margin: 0, fontWeight: 700, fontSize: '.92rem' }}>Identifiants par SMS</p>
              <p style={{ margin: '.3rem 0 0', color: 'var(--mkt-muted)', fontSize: '.85rem' }}>Parents et eleves recoivent leurs acces directement sur leur telephone.</p>
            </div>
            <div className="mkt-fc" style={{ padding: '1rem 1.2rem' }}>
              <p style={{ margin: 0, fontWeight: 700, fontSize: '.92rem' }}>Pense pour la Cote d&apos;Ivoire</p>
              <p style={{ margin: '.3rem 0 0', color: 'var(--mkt-muted)', fontSize: '.85rem' }}>Franc CFA, fuseau Africa/Abidjan et matricules locaux par defaut.</p>
            </div>
          </section>

          <section id="modules" className="mkt-feat">
            <h2>Un seul outil, tous les metiers de l&apos;ecole.</h2>
            <p className="sub">Chaque module fonctionne seul et se renforce des autres. Les donnees restent cloisonnees par etablissement.</p>
            <div className="mkt-fgrid">
              {MODULES.map((m) => (
                <div className="mkt-fc" key={m.title}>
                  <div className="ic" style={{ background: m.gradient }}>{m.icon}</div>
                  <h3>{m.title}</h3>
                  <p>{m.text}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="mkt-roles">
            {ROLES.map((r) => (
              <div className="mkt-role" key={r.label}>
                <span className="av" style={{ background: r.color }}>{r.initial}</span> {r.label}
              </div>
            ))}
          </section>

          <section id="acces" className="mkt-cta-band">
            <div className="mkt-cta-inner">
              <h2>Parents &amp; eleves : retrouvez votre espace</h2>
              <div style={{ maxWidth: '32rem', margin: '0 auto', textAlign: 'left' }}>
                <SchoolAccessForm />
              </div>
              <p className="note">Personnel &amp; direction : <Link href="/login" style={{ color: '#fff', textDecoration: 'underline' }}>connexion par e-mail</Link>.</p>
            </div>
          </section>
        </div>

        <div className="mkt-wrap">
          <footer className="mkt-footer">
            <span>&copy; {new Date().getFullYear()} {brand}</span>
            <div className="mkt-footer-links">
              <Link href="/login">Se connecter</Link>
              <a href="#acces">Espace parents &amp; eleves</a>
              <a href="#modules">Modules</a>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
