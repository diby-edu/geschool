import {
  BadgeCheck,
  Bell,
  CalendarDays,
  ClipboardCheck,
  FileText,
  GraduationCap,
  KeyRound,
  LayoutDashboard,
  Megaphone,
  SlidersHorizontal,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { ModuleKey } from '@/lib/modules';

export type NavItem = {
  href: string;
  label: string;
  /** Titre de groupe : affiché quand il change d'une entrée à la suivante (grands écrans). */
  section?: string;
  /** Module du menu : donne sa pastille colorée (même couleur que son bloc du tableau de bord). */
  icon?: ModuleKey;
};

export const MODULE_ICON: Record<ModuleKey, LucideIcon> = {
  dashboard: LayoutDashboard,
  personnel: BadgeCheck,
  enseignants: UserRound,
  eleves: Users,
  acces: KeyRound,
  edt: CalendarDays,
  notes: GraduationCap,
  presences: ClipboardCheck,
  bulletins: FileText,
  annonces: Megaphone,
  notifications: Bell,
  parametres: SlidersHorizontal,
};
