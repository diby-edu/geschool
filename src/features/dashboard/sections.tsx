import { ClipboardCheck, GraduationCap } from 'lucide-react';
import type { TenantContext } from '@/lib/tenant/context';
import { roleLabel } from '@/lib/permissions/roles';
import type { DashboardData } from './types';
import { ModuleTile } from './components/ModuleTile';

function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m}`;
}

const fr = (n: number) => n.toLocaleString('fr-FR');
const plural = (n: number, one: string, many: string) => (n > 1 ? many : one);
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : null);

/** Fonctions administratives de la personne (les espaces enseignant/parent ont leur propre libellé). */
export function staffRoleText(ctx: TenantContext): string {
  const roles = (ctx.membership?.roles ?? []).filter((r) => r !== 'TEACHER' && r !== 'PARENT' && r !== 'STUDENT');
  if (roles.length > 0) return roles.map(roleLabel).join(' · ');
  return ctx.isPlatformAdmin ? 'Administrateur de la plateforme' : 'Équipe de direction';
}

export function bannerFor(ctx: TenantContext, data: DashboardData) {
  const periodName = data.kind === 'teacher' ? data.stats.periodName : null;
  const periodText = [ctx.academicYear?.name, periodName].filter(Boolean).join(' · ') || 'Année scolaire';

  if (data.kind === 'teacher') {
    return {
      roleText: 'Enseignant',
      periodText,
      schoolCode: undefined,
      chips: [
        { label: plural(data.stats.classesCount, 'classe', 'classes'), value: data.stats.classesCount },
        { label: plural(data.stats.studentsCount, 'apprenant', 'apprenants'), value: data.stats.studentsCount },
      ],
    };
  }
  return {
    roleText: 'Espace Parent',
    periodText,
    schoolCode: undefined,
    chips: [{ label: plural(data.students.length, 'enfant', 'enfants'), value: data.students.length }],
  };
}

type TeacherData = Extract<DashboardData, { kind: 'teacher' }>;

export function teacherTiles(data: TeacherData, base: string, show: { attendance: boolean; assessments: boolean } = { attendance: true, assessments: true }) {
  const { stats } = data;
  const done = stats.callsDonePeriod;
  const expected = stats.callsExpectedPeriod;
  if (!show.attendance && !show.assessments) return null;
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {show.attendance ? <ModuleTile
        href={`${base}/attendance`}
        title="Appel numérique"
        icon={ClipboardCheck}
        tone="green"
        percent={pct(done, expected)}
        ringLabel={`${done}/${expected}`}
        ringUnit={plural(done, 'appel', 'appels')}
        headline={`Appels · ${stats.periodName ?? 'période en cours'}`}
        detail={
          expected === 0
            ? 'Aucun cours à appeler sur cette période.'
            : done >= expected
              ? 'Tous vos appels sont faits.'
              : `${expected - done} ${plural(expected - done, 'appel reste', 'appels restent')} à faire.`
        }
        footer={['Depuis la rentrée', `${stats.callsDoneYear} / ${stats.callsExpectedYear}`]}
      /> : null}
      {show.assessments ? <ModuleTile
        href={`${base}/evaluations`}
        title="Notes & évaluations"
        icon={GraduationCap}
        tone="indigo"
        percent={null}
        ringLabel={fr(stats.evaluationsCount)}
        headline={`${fr(stats.evaluationsCount)} ${plural(stats.evaluationsCount, 'évaluation', 'évaluations')}`}
        detail="Ouvrez une évaluation pour saisir ou corriger les notes."
        footer={['Volume horaire', `${formatMinutes(stats.weeklyMinutes)} / semaine`]}
      /> : null}
    </div>
  );
}

