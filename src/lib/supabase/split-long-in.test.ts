import { describe, expect, it, vi } from 'vitest';
import { splitLongIn } from './split-long-in';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`);
const REST = 'https://x.supabase.co/rest/v1/attendance_registers';

/** Fausse base : renvoie une ligne par identifiant demandé. */
function fakeBase() {
  return vi.fn(async (input: Parameters<typeof fetch>[0]) => {
    const url = new URL(String(input));
    const list = (url.searchParams.get('session_occurrence_id') ?? 'in.()').slice(4, -1).split(',').filter(Boolean);
    return new Response(JSON.stringify(list.map((id, i) => ({ id, n: list.length - i }))), { status: 200, headers: { 'content-type': 'application/json' } });
  });
}

describe('splitLongIn', () => {
  it('laisse passer telle quelle une adresse courte', async () => {
    const base = fakeBase();
    await splitLongIn(base)(`${REST}?select=id&session_occurrence_id=in.(${ids(10).join(',')})`);
    expect(base).toHaveBeenCalledTimes(1);
  });

  it('découpe une longue liste et rend toutes les lignes', async () => {
    const base = fakeBase();
    const all = ids(480);
    const res = await splitLongIn(base)(`${REST}?select=id&school_id=eq.s&session_occurrence_id=in.(${all.join(',')})`);
    const rows = (await res.json()) as { id: string }[];
    expect(base).toHaveBeenCalledTimes(4);
    expect(rows.map((r) => r.id).sort()).toEqual([...all].sort());
    for (const call of base.mock.calls) expect(String(call[0])).toContain('school_id=eq.s');
  });

  it('retrie les lignes réassemblées', async () => {
    const res = await splitLongIn(fakeBase())(`${REST}?select=id,n&session_occurrence_id=in.(${ids(300).join(',')})&order=n.desc`);
    const rows = (await res.json()) as { n: number }[];
    expect(rows.map((r) => r.n)).toEqual([...rows.map((r) => r.n)].sort((a, b) => b - a));
  });

  it('ne découpe pas ce qui changerait le résultat (pagination, comptage, ligne unique, écriture, table liée)', async () => {
    const list = `in.(${ids(300).join(',')})`;
    const cases: [string, RequestInit | undefined][] = [
      [`${REST}?select=id&session_occurrence_id=${list}&limit=5`, undefined],
      [`${REST}?select=id&session_occurrence_id=${list}`, { headers: { Prefer: 'count=exact' } }],
      [`${REST}?select=id&session_occurrence_id=${list}`, { headers: { Accept: 'application/vnd.pgrst.object+json' } }],
      [`${REST}?session_occurrence_id=${list}`, { method: 'PATCH' }],
      [`${REST}?select=id,classes!inner(id)&classes.id=${list}`, undefined],
      [`${REST}?select=id&session_occurrence_id=not.${list}`, undefined],
    ];
    for (const [url, init] of cases) {
      const base = fakeBase();
      await splitLongIn(base)(url, init);
      expect(base).toHaveBeenCalledTimes(1);
    }
  });

  it('rend la réponse en erreur si un morceau échoue', async () => {
    let n = 0;
    const base = vi.fn(async () => (++n === 2 ? new Response('{"message":"x"}', { status: 400 }) : new Response('[]', { status: 200 })));
    const res = await splitLongIn(base)(`${REST}?select=id&session_occurrence_id=in.(${ids(300).join(',')})`);
    expect(res.status).toBe(400);
  });
});
