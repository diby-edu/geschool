import { getTenantContext } from '@/lib/tenant/context';
import { toAppError } from '@/lib/errors';
import { requirePermission } from '@/lib/permissions';
import { audit } from '@/lib/audit';
import { buildPayroll } from '@/features/teachers/payroll';

/**
 * Heures faites et paie à l'heure d'un mois, au format Excel (CSV
 * point-virgule, accents compris). Consigné au journal : c'est de la paie.
 */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const month = new URL(request.url).searchParams.get('mois') ?? '';
  try {
    const ctx = await getTenantContext(slug);
    requirePermission(ctx, 'teachers.payroll');
    if (!/^\d{4}-\d{2}$/.test(month)) return new Response('Mois invalide.', { status: 422 });
    const rows = await buildPayroll(ctx, month);
    await audit(ctx, { action: 'payroll.export', module: 'teachers', entityType: 'school', entityId: ctx.school.id, after: { month } });

    const esc = (s: string) => (/[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
    const num = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');
    const lines = [
      `Heures faites et paie à l'heure — ${month} — ${ctx.school.name}`,
      ['Enseignant', 'Type', 'Heures faites', 'Sans appel', 'Quota par semaine', 'Heures payées', 'Taux (F/h)', 'Montant (F)'].join(';'),
      ...rows.map((r) =>
        [
          esc(r.name),
          r.kind === 'HOURLY' ? 'Vacataire' : 'Permanent',
          num(r.result.doneHours),
          num(r.result.unattestedHours),
          r.kind === 'PERMANENT' ? (r.quota === null ? 'non fixé' : num(r.quota)) : '',
          num(r.result.payableHours),
          num(r.rate),
          num(r.result.amount),
        ].join(';'),
      ),
    ];
    return new Response('﻿' + lines.join('\r\n') + '\r\n', {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="paie-enseignants-${month}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    const e = toAppError(error);
    return new Response(e.message, { status: e.httpStatus });
  }
}
