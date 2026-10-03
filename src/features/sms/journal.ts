import 'server-only';

import { createClient } from '@/lib/supabase/server';

/**
 * Ce qui est parti, ce qui est arrivé, ce que ça a coûté.
 *
 * Les règles d'accès font le tri (migration 0089) : l'éditeur voit tout, une
 * école ne voit que ses propres envois, un enseignant ne voit rien.
 */

export type SmsRow = {
  id: string;
  school: string | null;
  to: string;
  body: string;
  sender: string;
  status: string;
  parts: number;
  cost: number | null;
  error: string | null;
  permanent: boolean;
  kind: string;
  at: string;
};

export type SmsJournal = {
  rows: SmsRow[];
  /** Sur la période lue : combien partis, arrivés, échoués, et le coût. */
  totals: { sent: number; delivered: number; failed: number; parts: number; cost: number };
};

export async function readSmsJournal(limit = 100, schoolId?: string): Promise<SmsJournal> {
  const supabase = await createClient();
  let q = supabase
    .from('sms_messages')
    .select('id, to_e164, body, sender, status, parts, cost, error_message, permanent_failure, kind, created_at, schools(name)')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (schoolId) q = q.eq('school_id', schoolId);
  const { data } = await q;

  const rows = ((data ?? []) as unknown as {
    id: string;
    to_e164: string;
    body: string;
    sender: string;
    status: string;
    parts: number;
    cost: number | null;
    error_message: string | null;
    permanent_failure: boolean;
    kind: string;
    created_at: string;
    schools: { name: string } | null;
  }[]).map((r) => ({
    id: r.id,
    school: r.schools?.name ?? null,
    to: r.to_e164,
    body: r.body,
    sender: r.sender,
    status: r.status,
    parts: r.parts,
    cost: r.cost === null ? null : Number(r.cost),
    error: r.error_message,
    permanent: r.permanent_failure,
    kind: r.kind,
    at: r.created_at,
  }));

  const totals = rows.reduce(
    (acc, r) => ({
      sent: acc.sent + (r.status === 'SENT' || r.status === 'DELIVERED' ? 1 : 0),
      delivered: acc.delivered + (r.status === 'DELIVERED' ? 1 : 0),
      failed: acc.failed + (r.status === 'FAILED' ? 1 : 0),
      parts: acc.parts + r.parts,
      cost: acc.cost + (r.cost ?? 0),
    }),
    { sent: 0, delivered: 0, failed: 0, parts: 0, cost: 0 },
  );

  return { rows, totals };
}
