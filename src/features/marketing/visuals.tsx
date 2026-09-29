import type { ReactNode } from 'react';

/**
 * Illustrations de la landing : maquettes du produit dessinees en HTML/CSS
 * (aucune image externe). Les noms et chiffres sont des exemples, signales
 * comme tels ; tout est decoratif (aria-hidden) car le texte voisin porte
 * deja l'information.
 */

export function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="lp-phone" aria-hidden="true">
      <div className="lp-phone-screen">{children}</div>
    </div>
  );
}

const ATTENDANCE = [
  { initials: 'KA', name: 'Kouassi A.', color: '#4a44e0', absent: false },
  { initials: 'TM', name: 'Traoré M.', color: '#16a06a', absent: false },
  { initials: 'BS', name: 'Bamba S.', color: '#f2711b', absent: true },
  { initials: 'KF', name: 'Koné F.', color: '#8b5cf6', absent: false },
  { initials: 'YK', name: 'Yao K.', color: '#12a99b', absent: false },
  { initials: 'DA', name: 'Diallo A.', color: '#e8508f', absent: false },
];

export function TeacherScreen() {
  return (
    <PhoneFrame>
      <div className="lp-scr-head" style={{ background: 'linear-gradient(135deg,#12a99b,#16a06a)' }}>
        <small>6ème A · 07:15</small>
        <b>Mathématiques — Appel</b>
      </div>
      <ul className="lp-scr-list">
        {ATTENDANCE.map((s) => (
          <li key={s.initials}>
            <span className="av" style={{ background: s.color }}>{s.initials}</span>
            <span className="nm">{s.name}</span>
            <span className={`pill ${s.absent ? 'ko' : 'ok'}`}>{s.absent ? 'Absent' : 'Présent'}</span>
          </li>
        ))}
      </ul>
      <div className="lp-scr-foot">
        <span className="btn" style={{ background: 'linear-gradient(135deg,#12a99b,#16a06a)' }}>Valider l&apos;appel</span>
      </div>
    </PhoneFrame>
  );
}

const NOTIFICATIONS = [
  { color: '#ff6a5a', title: 'Absence enregistrée', text: 'Mathématiques · 09:40', glyph: '!' },
  { color: '#16a06a', title: 'Nouvelle note', text: 'Français · 15/20', glyph: '✓' },
  { color: '#4a44e0', title: 'Bulletin disponible', text: '1er trimestre', glyph: '≡' },
];

export function ParentScreen() {
  return (
    <PhoneFrame>
      <div className="lp-scr-head" style={{ background: 'linear-gradient(135deg,#f2a71b,#f2711b)' }}>
        <small>Espace Parent</small>
        <b>Ama · 6ème A</b>
      </div>
      <ul className="lp-scr-list notif">
        {NOTIFICATIONS.map((n) => (
          <li key={n.title}>
            <span className="glyph" style={{ background: n.color }}>{n.glyph}</span>
            <span className="tx"><b>{n.title}</b><small>{n.text}</small></span>
          </li>
        ))}
      </ul>
      <div className="lp-scr-foot">
        <span className="btn" style={{ background: 'linear-gradient(135deg,#f2a71b,#f2711b)' }}>Voir le bulletin</span>
      </div>
    </PhoneFrame>
  );
}

/** Ecran d'accueil Android avec la feuille d'installation qui remonte en boucle. */
export function InstallScreen() {
  const icons = ['#4a44e0', '#16a06a', '#f2a71b', '#e8508f', '#12a99b', '#8b5cf6', '#ff6a5a', '#f2711b'];
  return (
    <PhoneFrame>
      <div className="lp-home">
        <div className="lp-home-grid">
          {icons.map((c) => (
            <span key={c} className="app" style={{ background: c }} />
          ))}
          <span className="app gs">GS</span>
        </div>
        <div className="lp-sheet">
          <span className="grip" />
          <div className="row">
            <span className="app gs sm">GS</span>
            <span className="tx"><b>Gestion Scolaire</b><small>Installer l&apos;application ?</small></span>
          </div>
          <span className="go">Installer</span>
        </div>
      </div>
    </PhoneFrame>
  );
}

export function AndroidLogo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M6 9a6 6 0 0 1 12 0Z" />
      <rect x="6" y="10" width="12" height="7.6" rx="1.2" />
      <rect x="3" y="10" width="2.2" height="5.6" rx="1.1" />
      <rect x="18.8" y="10" width="2.2" height="5.6" rx="1.1" />
      <rect x="8.4" y="16.6" width="2.2" height="4.4" rx="1.1" />
      <rect x="13.4" y="16.6" width="2.2" height="4.4" rx="1.1" />
      <path d="M8.6 3.6 7.2 1.8M15.4 3.6l1.4-1.8" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" fill="none" />
      <circle cx="9.6" cy="6.6" r="0.8" fill="#fff" />
      <circle cx="14.4" cy="6.6" r="0.8" fill="#fff" />
    </svg>
  );
}

export function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12M7 11l5 5 5-5M4 20h16" />
    </svg>
  );
}
