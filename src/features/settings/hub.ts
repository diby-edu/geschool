import {
  ShieldAlert,
  BookOpen,
  CalendarDays,
  ClipboardList,
  CreditCard,
  DoorOpen,
  FileSpreadsheet,
  KeyRound,
  Layers,
  LayoutGrid,
  Ruler,
  School,
  ScrollText,
  ShieldCheck,
  UserCog,
  UserPlus,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import type { FeatureCode } from '@/lib/modules/features';

/**
 * Page d'accueil des Paramètres : la configuration de l'établissement, en cartes
 * groupées par thème. Règle (§77 de la navigation) : on ne propose QUE des pages qui
 * existent, et seulement à qui a le droit de les ouvrir — une carte dont l'accès
 * serait refusé n'apparaît pas.
 */

export type HubTone = 'indigo' | 'violet' | 'amber';

export type HubCard = {
  /** Chemin sous /e/{slug}/. */
  path: string;
  title: string;
  description: string;
  icon: LucideIcon;
  /** La carte s'affiche si l'utilisateur détient AU MOINS un de ces droits. */
  any: string[];
  /** Module vendable : la carte disparaît si la plateforme l'a coupé (0070). */
  feature?: FeatureCode;
};

export type HubSection = { id: string; label: string; tone: HubTone; cards: HubCard[] };

export const HUB_TONE_COLOR: Record<HubTone, string> = {
  indigo: '#4a44e0',
  violet: '#8b5cf6',
  amber: '#d98a00',
};

export const HUB: HubSection[] = [
  {
    id: 'etablissement',
    label: 'Établissement',
    tone: 'indigo',
    cards: [
      {
        path: 'parametres/identite',
        title: 'Identité de l’école',
        description: 'Nom, directeur, coordonnées, code officiel.',
        icon: School,
        any: ['settings.update'],
      },
      {
        path: 'parametres/inscriptions',
        title: 'Règles d’inscription',
        description: 'Le matricule : fourni par l’État, ou attribué par l’école.',
        icon: UserPlus,
        any: ['settings.update'],
      },
      {
        path: 'academic-years',
        title: 'Années scolaires',
        description: 'Années, périodes (trimestres) et grille horaire par cycle.',
        icon: CalendarDays,
        any: ['academic_years.view'],
      },
      {
        path: 'import',
        feature: 'import_export',
        title: 'Import / export des listes',
        description: 'Salles, classes, enseignants, personnel et élèves, depuis ou vers Excel.',
        icon: FileSpreadsheet,
        any: ['rooms.create', 'classes.create', 'teachers.create', 'users.create', 'students.create', 'rooms.view', 'classes.view', 'teachers.view', 'users.view', 'students.export'],
      },
    ],
  },
  {
    id: 'pedagogie',
    label: 'Pédagogie',
    tone: 'violet',
    cards: [
      {
        path: 'structure',
        title: 'Cycles et niveaux',
        description: 'Organisation des cycles d’enseignement et de leurs niveaux.',
        icon: Layers,
        any: ['cycles.view', 'levels.view'],
      },
      {
        path: 'classes',
        title: 'Classes',
        description: 'Sections, effectifs et titulaires.',
        icon: LayoutGrid,
        any: ['classes.view'],
      },
      {
        path: 'subjects',
        title: 'Matières',
        description: 'La liste des matières, leur programme par niveau et le tableau des coefficients.',
        icon: BookOpen,
        any: ['subjects.view'],
      },
      {
        path: 'groupes',
        title: 'Groupes d’élèves',
        description: 'LV2, options, demi-groupes : quand une partie de la classe seulement suit un cours.',
        icon: UsersRound,
        any: ['groups.view'],
      },
      {
        path: 'assignments',
        title: 'Affectations',
        description: 'Qui enseigne quoi, dans quelle classe.',
        icon: ClipboardList,
        any: ['assignments.view'],
      },
      {
        path: 'evaluations/config',
        feature: 'grades',
        title: 'Notation',
        description: 'Barèmes, types d’évaluation et règles de calcul des moyennes.',
        icon: Ruler,
        any: ['grading.manage_scales', 'grading.manage_settings'],
      },
      {
        path: 'discipline/config',
        feature: 'discipline',
        title: 'Motifs et sanctions',
        description: 'Le règlement intérieur : ce qui est reproché, ce qui est décidé.',
        icon: ShieldAlert,
        any: ['discipline.configure'],
      },
      {
        path: 'rooms',
        feature: 'rooms',
        title: 'Salles',
        description: 'Salles, capacités et équipements.',
        icon: DoorOpen,
        any: ['rooms.view'],
      },
    ],
  },
  {
    id: 'compte',
    label: 'Compte et abonnement',
    tone: 'amber',
    cards: [
      {
        path: 'facturation',
        title: 'Abonnement',
        description: 'Modules souscrits, échéance et utilisation.',
        icon: CreditCard,
        any: ['billing.view'],
      },
      {
        path: 'roles',
        title: 'Rôles et droits',
        description: 'Ce que chaque fonction du personnel peut faire.',
        icon: ShieldCheck,
        any: ['users.assign_roles'],
      },
      {
        path: 'access',
        title: 'Accès et identifiants',
        description: 'Comptes, activation et transmission des identifiants.',
        icon: KeyRound,
        any: ['access_accounts.view'],
      },
      {
        path: 'personnel',
        title: 'Personnel administratif',
        description: 'Comptes et fonctions de l’équipe de direction.',
        icon: UserCog,
        any: ['users.view'],
      },
      {
        path: 'audit',
        title: 'Journal d’audit',
        description: 'Qui a fait quoi, et quand.',
        icon: ScrollText,
        any: ['audit.view'],
      },
    ],
  },
];

/** Tous les droits qui ouvrent au moins une carte : ils décident si le menu propose « Paramètres ». */
export const HUB_PERMISSIONS: string[] = [...new Set(HUB.flatMap((s) => s.cards.flatMap((c) => c.any)))];
