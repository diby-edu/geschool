import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Le blocage par quota, au moment d'envoyer.
 *
 * La regle a tenir coute que coute : les IDENTIFIANTS DE CONNEXION partent
 * toujours, meme quota epuise. Les couper empecherait un enseignant d'entrer
 * dans l'application — on punirait l'ecole deux fois. Seules les alertes
 * attendent le mois suivant ou un complement.
 */

vi.mock('server-only', () => ({}));

const envoyes: { to: string; body: string }[] = [];
const lignes: Record<string, unknown>[] = [];
let quota = { included: 0, granted: 0, used: 0 };
let quotaErreur: { message: string } | null = null;

vi.mock('@/lib/sms', () => ({
  getSmsProvider: () => ({
    name: 'faux',
    send: async (msg: { to: string; body: string }) => {
      envoyes.push(msg);
      return { ok: true, provider: 'faux', providerMessageId: 'id-faux' };
    },
  }),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: async () => ({ data: quotaErreur ? null : [quota], error: quotaErreur }),
    from: () => ({
      insert: (ligne: Record<string, unknown>) => {
        lignes.push(ligne);
        return { select: () => ({ single: async () => ({ data: { id: 'ligne-1' }, error: null }) }) };
      },
    }),
  }),
}));

import { sendAndLog } from './sms-log';

beforeEach(() => {
  envoyes.length = 0;
  lignes.length = 0;
  quota = { included: 0, granted: 0, used: 0 };
  quotaErreur = null;
});

const base = { schoolId: 'ecole-1', to: '+2250700000000', body: 'Bonjour', sender: 'TEST' };

describe('quota epuise', () => {
  beforeEach(() => {
    quota = { included: 10, granted: 0, used: 10 };
  });

  it('bloque une alerte sans rien envoyer', async () => {
    const r = await sendAndLog({ ...base, kind: 'ATTENDANCE' });
    expect(r.ok).toBe(false);
    expect(r.quotaBlocked).toBe(true);
    expect(envoyes).toHaveLength(0);
  });

  it('garde la trace du refus, sans le facturer', async () => {
    await sendAndLog({ ...base, kind: 'ATTENDANCE', pricePerSms: 15 });
    expect(lignes).toHaveLength(1);
    expect(lignes[0]).toMatchObject({ status: 'FAILED', error_code: 'QUOTA_EXCEEDED', cost: 0 });
  });

  it('LAISSE PARTIR les identifiants de connexion', async () => {
    const r = await sendAndLog({ ...base, kind: 'CREDENTIALS' });
    expect(r.ok).toBe(true);
    expect(envoyes).toHaveLength(1);
  });

  it('laisse partir aussi quand le type n’est pas précisé (identifiants par défaut)', async () => {
    const r = await sendAndLog({ ...base });
    expect(r.ok).toBe(true);
    expect(envoyes).toHaveLength(1);
  });

  it('n’empêche pas un envoi de la plateforme, qui n’a pas d’école', async () => {
    const r = await sendAndLog({ ...base, schoolId: null, kind: 'TEST' });
    expect(r.ok).toBe(true);
    expect(envoyes).toHaveLength(1);
  });
});

describe('quota suffisant', () => {
  it('laisse passer une alerte', async () => {
    quota = { included: 500, granted: 0, used: 12 };
    const r = await sendAndLog({ ...base, kind: 'ATTENDANCE' });
    expect(r.ok).toBe(true);
    expect(envoyes).toHaveLength(1);
  });

  it('refuse un message compté 2 SMS quand il n’en reste qu’un', async () => {
    quota = { included: 10, granted: 0, used: 9 };
    // Le « ç » minuscule n'est pas dans l'alphabet GSM : la limite tombe de
    // 160 a 70 caracteres, et ce message passe donc a deux parts.
    const long = `Reçu ça${'a'.repeat(80)}`;
    const r = await sendAndLog({ ...base, body: long, clean: false, kind: 'ATTENDANCE' });
    expect(r.parts).toBe(2);
    expect(r.ok).toBe(false);
    expect(r.quotaBlocked).toBe(true);
  });

  it('compte le complément accordé dans la limite', async () => {
    quota = { included: 10, granted: 5, used: 12 };
    const r = await sendAndLog({ ...base, kind: 'ATTENDANCE' });
    expect(r.ok).toBe(true);
  });
});

describe('aucun quota configuré', () => {
  it('laisse tout passer : une école ne devient pas muette faute de réglage', async () => {
    quota = { included: 0, granted: 0, used: 4000 };
    const r = await sendAndLog({ ...base, kind: 'ATTENDANCE' });
    expect(r.ok).toBe(true);
  });
});

describe('quota illisible', () => {
  it('échoue OUVERT : une panne de base ne prive pas une famille de son alerte', async () => {
    quotaErreur = { message: 'connexion perdue' };
    const r = await sendAndLog({ ...base, kind: 'ATTENDANCE' });
    expect(r.ok).toBe(true);
    expect(envoyes).toHaveLength(1);
  });
});
