import {
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  FileSpreadsheet,
  FileText,
  GraduationCap,
  History,
  KeyRound,
  Megaphone,
  ShieldCheck,
  UserPlus,
} from 'lucide-react';
import Link from 'next/link';
import { Alert } from '@/components/ui/alert';
import type { TenantContext } from '@/lib/tenant/context';
import { hasAnyPermission, hasPermission } from '@/lib/permissions';
import { parseDashParams } from '../params';
import { FOCUS_LAYOUT, focusesFor, planDashboard, type BlockKey, type Focus } from '../profiles';
import { loadRoleDashboard, type RoleDashboard } from '../role-data';
import { staffRoleText } from '../sections';
import { ActivityFeed } from './ActivityFeed';
import { WatchCard } from './Analyses';
import { DayBlock, dateFr } from './DayBlock';
import { GradingBlock } from './GradingBlock';
import { Hero, type HeroAction } from './Hero';
import { DayPanel } from './Panels';
import { AbsenteesCard, AnnouncementsCard, AssessmentActivityCard, ClassAveragesCard, DeliveriesCard, EnrollmentsCard, JustificationsCard, KpiGrid } from './RoleBlocks';
import { TimedRefresh } from './TimedRefresh';
import { TodoPanel } from './TodoPanel';
import { BlocHead, Card } from './ui';

type Sp = Record<string, string | string[] | undefined>;

/**
 * Tableau de bord PAR FONCTION (directeur, censeur, surveillant général,
 * éducateur, inspecteur, secrétaire, informaticien) — le fondateur garde
 * StaffView. Le plan (profiles.ts) fixe les indicateurs de la fonction et retire
 * ceux dont le droit est décoché ; une personne à plusieurs fonctions voit
 * l'union, sans doublon.
 */

/** Page Importer / exporter : ouverte dès qu'une liste s'importe ou s'exporte avec les droits de la personne. */
const IMPORT = Symbol('import');
type Action = HeroAction & { perm: string | readonly string[] | typeof IMPORT };
/** Module Présences : « consulter les appels » ou « toutes les présences ». */
const ATTENDANCE = ['attendance.view', 'attendance.view_all'] as const;

const FOCUS_ACTIONS: Record<Focus, (base: string) => Action[]> = {
  pedagogy: (base) => [
    { label: 'Notes & évaluations', href: `${base}/evaluations`, Icon: GraduationCap, group: 'module', perm: 'assessments.view' },
    { label: 'Moyennes', href: `${base}/evaluations/moyennes`, Icon: BookOpen, group: 'module', perm: 'grades.view_all' },
    { label: 'Bulletins', href: `${base}/bulletins`, Icon: FileText, group: 'module', perm: 'reports.view' },
    { label: 'Emploi du temps', href: `${base}/schedule`, Icon: CalendarDays, group: 'module', perm: 'schedule.view' },
  ],
  inspection: (base) => [
    { label: 'Notes & évaluations', href: `${base}/evaluations`, Icon: GraduationCap, group: 'module', perm: 'assessments.view' },
    { label: 'Moyennes', href: `${base}/evaluations/moyennes`, Icon: BookOpen, group: 'module', perm: 'grades.view_all' },
    { label: 'Programme', href: `${base}/programme`, Icon: CalendarDays, group: 'module', perm: 'subjects.view' },
  ],
  attendance: (base) => [
    { label: 'Présences', href: `${base}/attendance`, Icon: ClipboardCheck, group: 'module', perm: ATTENDANCE },
    { label: 'Absences', href: `${base}/attendance/absences`, Icon: ClipboardCheck, group: 'module', perm: ATTENDANCE },
    { label: 'Emploi du temps', href: `${base}/schedule`, Icon: CalendarDays, group: 'module', perm: 'schedule.view' },
  ],
  schoolLife: (base) => [
    { label: 'Justificatifs', href: `${base}/attendance/justificatifs`, Icon: ShieldCheck, group: 'module', perm: 'attendance.justify' },
    { label: 'Absences', href: `${base}/attendance/absences`, Icon: ClipboardCheck, group: 'module', perm: ATTENDANCE },
    { label: 'Présences', href: `${base}/attendance`, Icon: ClipboardCheck, group: 'module', perm: ATTENDANCE },
  ],
  followUp: (base) => [
    { label: 'Présences', href: `${base}/attendance`, Icon: ClipboardCheck, group: 'module', perm: ATTENDANCE },
    { label: 'Justificatifs', href: `${base}/attendance/justificatifs`, Icon: ShieldCheck, group: 'module', perm: 'attendance.justify' },
    { label: 'Gestion des accès', href: `${base}/access`, Icon: KeyRound, group: 'module', perm: 'access_accounts.view' },
  ],
  enrollment: (base) => [
    { label: 'Inscrire un élève', href: `${base}/students/new`, Icon: UserPlus, group: 'create', perm: 'students.create' },
    { label: 'Importer / exporter', href: `${base}/import`, Icon: FileSpreadsheet, group: 'module', perm: IMPORT },
    { label: 'Gestion des accès', href: `${base}/access`, Icon: KeyRound, group: 'module', perm: 'access_accounts.view' },
    { label: 'Annonces', href: `${base}/annonces`, Icon: Megaphone, group: 'module', perm: 'announcements.view' },
  ],
  accounts: (base) => [
    { label: 'Gestion des accès', href: `${base}/access`, Icon: KeyRound, group: 'module', perm: 'access_accounts.view' },
    { label: 'Importer / exporter', href: `${base}/import`, Icon: FileSpreadsheet, group: 'module', perm: IMPORT },
    { label: 'Journal', href: `${base}/audit`, Icon: History, group: 'module', perm: 'audit.view' },
  ],
};

export async function RoleView({
  ctx,
  sp,
  roles,
  preview,
}: {
  ctx: TenantContext;
  sp: Sp;
  roles: readonly string[];
  /** Aperçu d'une fonction depuis « Rôles et droits » (ctx porte alors ses seuls droits). */
  preview?: { label: string; backHref: string } | undefined;
}) {
  const params = parseDashParams(sp);
  const focuses = focusesFor(roles);
  const plan = planDashboard(focuses, (c) => hasPermission(ctx, c));
  const data = await loadRoleDashboard(ctx, plan, params);
  const base = `/e/${ctx.school.slug}`;
  const dash = `${base}/dashboard`;

  const seen = new Set<string>();
  const actions: HeroAction[] = focuses
    .flatMap((f) => FOCUS_ACTIONS[f](base))
    .filter((a) => {
      const ok = a.perm === IMPORT ? data.importOpen : typeof a.perm === 'string' ? hasPermission(ctx, a.perm) : hasAnyPermission(ctx, a.perm);
      if (!ok || seen.has(a.href)) return false;
      seen.add(a.href);
      return true;
    })
    .map(({ perm: _perm, ...a }) => a);

  const hasDay = plan.blocks.includes('day') && data.staff?.day;
  const focusText = focuses.map((f) => FOCUS_LAYOUT[f].label).join(' · ');
  const yearText = ctx.academicYear ? `année ${ctx.academicYear.name}` : 'aucune année active';
  const kpiByKey = new Map(data.kpis.map((k) => [k.key, k]));

  return (
    <div className="mx-auto max-w-6xl space-y-7">
      {hasDay ? <TimedRefresh /> : null}

      {preview ? (
        <Alert tone="info">
          Aperçu du tableau de bord de la fonction <b>{preview.label}</b>, avec les seuls droits cochés pour elle dans « Rôles et droits ».
          Décochez un droit : l’indicateur correspondant disparaît.{' '}
          <Link href={preview.backHref} className="font-semibold underline">
            Revenir aux droits de cette fonction
          </Link>
        </Alert>
      ) : null}

      <Hero
        name={preview ? preview.label : ctx.user.displayName}
        roleText={preview ? 'Aperçu de la fonction' : staffRoleText(ctx)}
        schoolName={ctx.school.name}
        dateText={dateFr(data.today)}
        periodText={ctx.academicYear ? [ctx.academicYear.name, data.periodName].filter(Boolean).join(' · ') : 'Aucune année active'}
        schoolCode={hasPermission(ctx, 'access_accounts.view') ? ctx.school.loginCode : undefined}
        chips={[]}
        actions={actions}
      />

      {data.missing ? (
        <Alert tone="info">Certains indicateurs nécessitent une mise à jour de la base (migration 0060). Demandez à l’administrateur technique de l’appliquer.</Alert>
      ) : null}

      {plan.kpis.length === 0 && plan.blocks.length === 0 ? (
        <Card>
          <h2 className="text-lg font-extrabold">Aucun indicateur pour vos droits actuels</h2>
          <p className="mt-2 text-sm text-[color:var(--muted-foreground)]">
            Les indicateurs de votre fonction dépendent des droits cochés pour elle dans « Rôles et droits ». Demandez au fondateur de les ajuster si vous en avez besoin.
          </p>
        </Card>
      ) : null}

      {/* Les angles de la fonction d'abord, puis ceux qu'ouvrent les autres droits cochés. */}
      {plan.groups.map((g, i) => {
        const label = FOCUS_LAYOUT[g.focus].label;
        const tiles = g.kpis.map((k) => kpiByKey.get(k)).filter((k): k is NonNullable<typeof k> => Boolean(k));
        return (
          <div key={g.focus} className="space-y-7">
            <KpiGrid
              kpis={tiles}
              title={g.primary ? (i === 0 ? 'Vos indicateurs' : label) : label}
              sub={g.primary ? `${i === 0 ? `${focusText} · ` : ''}${yearText}` : 'Ouvert par les droits cochés pour votre fonction'}
            />
            {g.blocks.map((b) => (
              <Block key={b} block={b} ctx={ctx} data={data} sp={sp} base={base} dash={dash} />
            ))}
          </div>
        );
      })}

      <section className="space-y-3">
        <BlocHead title="À traiter" />
        <Card>
          <TodoPanel items={data.todos} />
        </Card>
      </section>

      {hasDay && data.staff ? (
        <DayPanel
          data={data.staff}
          base={dash}
          sp={sp}
          tz={ctx.school.timezone}
          slug={ctx.school.slug}
          tab={params.callsTab}
          canOpenTeacherFile={hasPermission(ctx, 'teachers.update')}
        />
      ) : null}
    </div>
  );
}

function Block({ block, ctx, data, sp, base, dash }: { block: BlockKey; ctx: TenantContext; data: RoleDashboard; sp: Sp; base: string; dash: string }) {
  const page = (code: string, href: string) => (hasPermission(ctx, code) ? href : undefined);
  switch (block) {
    case 'day':
      return data.staff ? <DayBlock data={data.staff} base={dash} sp={sp} timezone={ctx.school.timezone} /> : null;
    case 'watch':
      return data.staff?.watch ? <WatchCard watch={data.staff.watch} base={dash} sp={sp} /> : null;
    case 'grading':
      return data.staff ? (
        <GradingBlock data={data.staff} base={dash} sp={sp} slug={ctx.school.slug} yearId={ctx.academicYear?.id ?? null} canManage={hasPermission(ctx, 'academic_years.manage')} />
      ) : null;
    case 'classAverages':
      return data.classAverages ? <ClassAveragesCard rows={data.classAverages} periodName={data.periodName} href={page('grades.view_all', `${base}/evaluations/moyennes`)} /> : null;
    case 'assessmentActivity':
      return data.activity ? <AssessmentActivityCard activity={data.activity} periodName={data.periodName} href={page('assessments.view', `${base}/evaluations`)} /> : null;
    case 'topAbsentees':
      return data.absentees ? <AbsenteesCard rows={data.absentees} href={`${base}/attendance/absences`} /> : null;
    case 'justifications':
      return data.justifications ? <JustificationsCard rows={data.justifications} href={page('attendance.justify', `${base}/attendance/justificatifs`)} /> : null;
    case 'recentEnrollments':
      return data.enrollments ? <EnrollmentsCard rows={data.enrollments} base={base} canOpen={hasPermission(ctx, 'students.view')} /> : null;
    case 'accessQueue':
      return data.deliveries ? <DeliveriesCard rows={data.deliveries} base={base} /> : null;
    case 'activity':
      return data.feed ? (
        <section className="space-y-3">
          <BlocHead title="Activité récente" sub="Journal des actions dans l’établissement" />
          <Card>
            <ActivityFeed items={data.feed} />
          </Card>
        </section>
      ) : null;
    case 'announcements':
      return data.announcements ? <AnnouncementsCard rows={data.announcements} base={base} /> : null;
  }
}
