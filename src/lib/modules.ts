/**
 * Une couleur par module, la MEME dans le menu et sur son bloc du tableau de bord
 * (la direction doit reconnaitre un module d'un coup d'oeil). Donnees pures :
 * utilisables aussi bien par un composant serveur que client.
 *
 * - c1 → c2   : degrade du bloc plein (le texte blanc y garde un contraste >= 4,5:1,
 *               sauf l'ambre, dont le texte est fonce : `onBlock`) ;
 * - tint/ink  : pastille claire (fond teinte + icone foncee) ;
 * - dtint/dink: pastille du mode sombre.
 */
export type ModuleKey =
  | 'dashboard'
  | 'personnel'
  | 'enseignants'
  | 'eleves'
  | 'acces'
  | 'edt'
  | 'notes'
  | 'presences'
  | 'bulletins'
  | 'annonces'
  | 'notifications'
  | 'parametres';

export type ModuleStyle = {
  c1: string;
  c2: string;
  onBlock: string;
  tint: string;
  ink: string;
  dtint: string;
  dink: string;
};

export const MODULE_STYLE: Record<ModuleKey, ModuleStyle> = {
  dashboard: { c1: '#3730a3', c2: '#5b50e6', onBlock: '#ffffff', tint: '#dedcff', ink: '#3730a3', dtint: 'rgba(139,133,255,0.30)', dink: '#c4c0ff' },
  personnel: { c1: '#86198f', c2: '#b02bbd', onBlock: '#ffffff', tint: '#f8e1fa', ink: '#86198f', dtint: 'rgba(217,70,239,0.18)', dink: '#f0abfc' },
  enseignants: { c1: '#075985', c2: '#0a76b3', onBlock: '#ffffff', tint: '#d9eefb', ink: '#075985', dtint: 'rgba(56,189,248,0.16)', dink: '#7dd3fc' },
  eleves: { c1: '#5b21b6', c2: '#8347ea', onBlock: '#ffffff', tint: '#ece2ff', ink: '#5b21b6', dtint: 'rgba(185,140,255,0.18)', dink: '#d0b3ff' },
  acces: { c1: '#f2a71b', c2: '#f7c04f', onBlock: '#2b1a00', tint: '#fdeccb', ink: '#8a4b00', dtint: 'rgba(251,191,36,0.16)', dink: '#fcd34d' },
  edt: { c1: '#0f5f5b', c2: '#0d7f78', onBlock: '#ffffff', tint: '#d6f3ef', ink: '#0d7f78', dtint: 'rgba(45,212,191,0.16)', dink: '#5eead4' },
  notes: { c1: '#3730a3', c2: '#5b50e6', onBlock: '#ffffff', tint: '#e4e2ff', ink: '#3730a3', dtint: 'rgba(139,133,255,0.18)', dink: '#b9b5ff' },
  presences: { c1: '#065f46', c2: '#0a7d55', onBlock: '#ffffff', tint: '#d9f2e6', ink: '#0b7f58', dtint: 'rgba(52,211,153,0.16)', dink: '#6ee7b7' },
  bulletins: { c1: '#9f1239', c2: '#c8245a', onBlock: '#ffffff', tint: '#fde1e9', ink: '#9f1239', dtint: 'rgba(251,113,133,0.16)', dink: '#fda4af' },
  annonces: { c1: '#9a3412', c2: '#c2410c', onBlock: '#ffffff', tint: '#ffe6d5', ink: '#9a3412', dtint: 'rgba(251,146,60,0.16)', dink: '#fdba74' },
  notifications: { c1: '#1e293b', c2: '#475569', onBlock: '#ffffff', tint: '#e6eaf0', ink: '#334155', dtint: 'rgba(148,163,184,0.16)', dink: '#cbd5e1' },
  parametres: { c1: '#1e293b', c2: '#475569', onBlock: '#ffffff', tint: '#e6eaf0', ink: '#334155', dtint: 'rgba(148,163,184,0.16)', dink: '#cbd5e1' },
};

/** Degrade CSS d'un bloc plein. */
export function moduleGradient(key: ModuleKey): string {
  const s = MODULE_STYLE[key];
  return `linear-gradient(135deg, ${s.c1} 0%, ${s.c2} 100%)`;
}

/** Nom du module tel qu'il s'ecrit dans le menu. */
export const MODULE_LABEL: Record<ModuleKey, string> = {
  dashboard: 'Tableau de bord',
  personnel: 'Personnel',
  enseignants: 'Enseignants',
  eleves: 'Élèves',
  acces: 'Gestion des accès',
  edt: 'Emploi du temps',
  notes: 'Notes & évaluations',
  presences: 'Présences',
  bulletins: 'Bulletins',
  annonces: 'Annonces',
  notifications: 'Notifications',
  parametres: 'Paramètres',
};
