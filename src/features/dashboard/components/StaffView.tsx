import { BadgePlus, CalendarDays, ClipboardCheck, FileText, UserPlus, UserRoundPlus } from 'lucide-react';
import type { TenantContext } from '@/lib/tenant/context';
import { hasAnyPermission, hasPermission } from '@/lib/permissions';
import { parseDashParams } from '../params';
import { loadStaffDashboard } from '../staff';
import { staffRoleText } from '../sections';
import { ActivityFeed } from './ActivityFeed';
import { AssiduityCard, LevelsCard, WatchCard } from './Analyses';
import { DayBlock, dateFr } from './DayBlock';
import { GradingBlock } from './GradingBlock';
import { Hero, type HeroAction } from './Hero';
import { DayPanel } from './Panels';
import { StatsBlock } from './StatsBlock';
import { TimedRefresh } from './TimedRefresh';
import { TodoPanel } from './TodoPanel';
import { BlocHead, Card, plural } from './ui';
import { readChecklist } from '@/features/onboarding/checklist';
import { StartupBanner } from '@/features/onboarding/components/StartupBanner';

type Sp = Record<string, string | string[] | undefined>;

/** Tableau de bord de la direction (espace « school ») — voir docs/RBAC.md pour les droits de chaque section. */
export async function StaffView({ ctx, sp }: { ctx: TenantContext; sp: Sp }) {
  const params = parseDashParams(sp);
  const data = await loadStaffDashboard(ctx, params);
  const base = `/e/${ctx.school.slug}`;
  const dash = `${base}/dashboard`;
  const o = data.overview;

  const chips: { label: string; value: number }[] = [];
  if (o.students) chips.push({ label: plural(o.students.total, 'élève', 'élèves'), value: o.students.total });
  if (o.teachers) chips.push({ label: plural(o.teachers.total, 'enseignant', 'enseignants'), value: o.teachers.total });
  if (o.personnel) chips.push({ label: 'personnel', value: o.personnel.total });
  if (o.classes !== null) chips.push({ label: plural(o.classes, 'classe', 'classes'), value: o.classes });

  // Actions de direction (créer) puis accès rapides (modules) : jamais un raccourci vers ce qu'on n'a pas le droit d'ouvrir.
  const actions: HeroAction[] = [];
  if (hasPermission(ctx, 'students.create')) actions.push({ label: 'Inscrire un élève', href: `${base}/students/new`, Icon: UserPlus, group: 'create' });
  if (hasPermission(ctx, 'teachers.create')) actions.push({ label: 'Ajouter un enseignant', href: `${base}/teachers/new`, Icon: UserRoundPlus, group: 'create' });
  if (hasPermission(ctx, 'users.create') && hasPermission(ctx, 'users.assign_roles')) actions.push({ label: 'Ajouter du personnel', href: `${base}/personnel/new`, Icon: BadgePlus, group: 'create' });
  if (hasPermission(ctx, 'schedule.view')) actions.push({ label: 'Emploi du temps', href: `${base}/schedule`, Icon: CalendarDays, group: 'module' });
  if (hasAnyPermission(ctx, ['attendance.view', 'attendance.view_all'])) actions.push({ label: 'Présences', href: `${base}/attendance`, Icon: ClipboardCheck, group: 'module' });
  if (hasPermission(ctx, 'reports.view')) actions.push({ label: 'Bulletins', href: `${base}/bulletins`, Icon: FileText, group: 'module' });

  // Tant que l'essentiel manque, le tableau de bord mesure du vide : on dit
  // d'abord par ou commencer.
  const demarrage = await readChecklist(ctx);

  return (
    <div className="mx-auto max-w-6xl space-y-7">
      {/* Le total des appels attendus change à chaque fin de créneau : relecture chaque minute (les données, elles, arrivent en direct). */}
      <TimedRefresh />

      {demarrage.ready ? null : (
        <StartupBanner slug={ctx.school.slug} done={demarrage.done} total={demarrage.total} steps={demarrage.steps} />
      )}

      <Hero
        name={ctx.user.displayName}
        roleText={staffRoleText(ctx)}
        schoolName={ctx.school.name}
        dateText={dateFr(data.today)}
        periodText={ctx.academicYear ? [ctx.academicYear.name, data.periodName].filter(Boolean).join(' · ') : 'Aucune année active'}
        schoolCode={ctx.school.loginCode}
        chips={chips}
        actions={actions}
      />

      <DayBlock data={data} base={dash} sp={sp} timezone={ctx.school.timezone} />

      <GradingBlock data={data} base={dash} sp={sp} slug={ctx.school.slug} yearId={ctx.academicYear?.id ?? null} canManage={hasPermission(ctx, 'academic_years.manage')} />

      <StatsBlock o={o} base={base} />

      {o.weekly || o.levelDistribution ? (
        <section className="grid gap-4 lg:grid-cols-[1.55fr_1fr]">
          {data.day ? <AssiduityCard weekly={o.weekly} /> : null}
          {o.levelDistribution ? <LevelsCard levels={o.levelDistribution} /> : null}
        </section>
      ) : null}

      {data.watch ? <WatchCard watch={data.watch} base={dash} sp={sp} /> : null}

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <BlocHead title="À traiter" />
          <Card>
            <TodoPanel items={data.todos} />
          </Card>
        </div>
        {o.activity ? (
          <div className="space-y-3">
            <BlocHead title="Activité récente" />
            <Card>
              <ActivityFeed items={o.activity} />
            </Card>
          </div>
        ) : null}
      </section>

      <DayPanel data={data} base={dash} sp={sp} tz={ctx.school.timezone} slug={ctx.school.slug} tab={params.callsTab} canOpenTeacherFile={hasPermission(ctx, 'teachers.update')} />
    </div>
  );
}
