import { describe, expect, it, vi } from 'vitest';
import { createLimitedFetch, isConnectionFailure, isSafeToRepeat } from './limited-fetch';

const connectTimeout = () => Object.assign(new TypeError('fetch failed'), { cause: { code: 'UND_ERR_CONNECT_TIMEOUT' } });
const reset = () => Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } });
const ok = () => new Response('{}', { status: 200 });

describe('isConnectionFailure', () => {
  it('reconnait une connexion jamais etablie', () => {
    expect(isConnectionFailure(connectTimeout())).toBe(true);
  });
  it("ignore ce qui a pu survenir apres l'envoi, et ce qui n'est pas une erreur reseau", () => {
    expect(isConnectionFailure(reset())).toBe(false);
    expect(isConnectionFailure(new Error('boom'))).toBe(false);
    expect(isConnectionFailure(new TypeError('fetch failed'))).toBe(false);
    expect(isConnectionFailure('UND_ERR_CONNECT_TIMEOUT')).toBe(false);
  });
});

describe('createLimitedFetch', () => {
  it('ne depasse jamais le plafond de requetes simultanees, et les sert toutes', async () => {
    let active = 0;
    let peak = 0;
    const base = vi.fn(async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return ok();
    });
    const limited = createLimitedFetch(base as unknown as typeof fetch, { limit: 3 });

    const responses = await Promise.all(Array.from({ length: 20 }, () => limited('https://x.test/')));

    expect(responses).toHaveLength(20);
    expect(base).toHaveBeenCalledTimes(20);
    expect(peak).toBe(3);
  });

  it('libere sa place meme quand la requete echoue', async () => {
    const base = vi.fn(async () => {
      throw new Error('boom');
    });
    const limited = createLimitedFetch(base as unknown as typeof fetch, { limit: 1, hedges: 0 });

    await expect(limited('https://x.test/')).rejects.toThrow('boom');
    await expect(limited('https://x.test/')).rejects.toThrow('boom');
    expect(base).toHaveBeenCalledTimes(2);
  });

  it("rejoue une fois une connexion qui n'a pas abouti", async () => {
    const base = vi.fn().mockRejectedValueOnce(connectTimeout()).mockResolvedValueOnce(ok());
    const limited = createLimitedFetch(base as unknown as typeof fetch);

    const res = await limited('https://x.test/', { method: 'POST', body: '{}' });

    expect(res.status).toBe(200);
    expect(base).toHaveBeenCalledTimes(2);
  });

  it("s'arrete apres le nombre de tentatives prevu et remonte l'erreur d'origine", async () => {
    const error = connectTimeout();
    const base = vi.fn().mockRejectedValue(error);
    const limited = createLimitedFetch(base as unknown as typeof fetch, { retries: 1, hedges: 0 });

    await expect(limited('https://x.test/')).rejects.toBe(error);
    expect(base).toHaveBeenCalledTimes(2);
  });

  it('ne rejoue pas une erreur qui a pu suivre l\'envoi, ni une reponse 500', async () => {
    const resetBase = vi.fn().mockRejectedValue(reset());
    await expect(createLimitedFetch(resetBase as unknown as typeof fetch, { hedges: 0 })('https://x.test/')).rejects.toThrow();
    expect(resetBase).toHaveBeenCalledTimes(1);

    const serverError = vi.fn().mockResolvedValue(new Response('{}', { status: 500 }));
    const res = await createLimitedFetch(serverError as unknown as typeof fetch)('https://x.test/');
    expect(res.status).toBe(500);
    expect(serverError).toHaveBeenCalledTimes(1);
  });

  it('ne rejoue pas une Request (corps a usage unique)', async () => {
    const base = vi.fn().mockRejectedValue(connectTimeout());
    const limited = createLimitedFetch(base as unknown as typeof fetch);

    await expect(limited(new Request('https://x.test/', { method: 'POST', body: '{}' }))).rejects.toThrow();
    expect(base).toHaveBeenCalledTimes(1);
  });
});

describe('isSafeToRepeat', () => {
  const rest = 'https://p.supabase.co/rest/v1';
  it('admet les lectures et les fonctions de consultation', () => {
    expect(isSafeToRepeat(`${rest}/students?select=id`)).toBe(true);
    expect(isSafeToRepeat(`${rest}/students`, { method: 'HEAD' })).toBe(true);
    expect(isSafeToRepeat('https://p.supabase.co/auth/v1/user')).toBe(true);
    for (const fn of ['dashboard_day_overview', 'my_permission_codes', 'is_platform_admin']) {
      expect(isSafeToRepeat(`${rest}/rpc/${fn}`, { method: 'POST', body: '{}' })).toBe(true);
    }
  });
  it('exclut toute ecriture et toute fonction inconnue', () => {
    expect(isSafeToRepeat(`${rest}/students`, { method: 'POST', body: '{}' })).toBe(false);
    expect(isSafeToRepeat(`${rest}/students?id=eq.1`, { method: 'PATCH', body: '{}' })).toBe(false);
    expect(isSafeToRepeat(`${rest}/students?id=eq.1`, { method: 'DELETE' })).toBe(false);
    expect(isSafeToRepeat(`${rest}/rpc/create_school`, { method: 'POST', body: '{}' })).toBe(false);
    expect(isSafeToRepeat(new Request(`${rest}/students`))).toBe(false);
  });
});

describe('lecture relancee sans reponse', () => {
  const read = 'https://p.supabase.co/rest/v1/students?select=id';
  const start = () => vi.useFakeTimers();
  const stop = () => vi.useRealTimers();

  /** base dont chaque appel est decrit par un script : 'hang' = jamais de reponse (sauf annulation), 'ok', 'fail'. */
  function scripted(steps: Array<'hang' | 'ok' | 'fail'>) {
    const signals: AbortSignal[] = [];
    let call = 0;
    const base = vi.fn((_input: unknown, init?: RequestInit) => {
      const step = steps[call++] ?? 'ok';
      signals.push(init!.signal!);
      if (step === 'ok') return Promise.resolve(ok());
      if (step === 'fail') return Promise.reject(new TypeError(`echec ${call}`));
      return new Promise<Response>((_, reject) => init!.signal!.addEventListener('abort', () => reject(new DOMException('annule', 'AbortError'))));
    });
    return { base: base as unknown as typeof fetch, mock: base, signals };
  }

  it("relance au bout du delai, garde la premiere reponse et annule l'attente perdue", async () => {
    start();
    try {
      const { base, mock, signals } = scripted(['hang', 'ok']);
      const pending = createLimitedFetch(base, { hedgeAfterMs: 3_000 })(read);

      await vi.advanceTimersByTimeAsync(2_999);
      expect(mock).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);

      await expect(pending).resolves.toHaveProperty('status', 200);
      expect(mock).toHaveBeenCalledTimes(2);
      expect(signals[0]!.aborted).toBe(true);
      expect(signals[1]!.aborted).toBe(false);
    } finally {
      stop();
    }
  });

  it('ne relance rien quand la reponse arrive vite, meme longtemps apres', async () => {
    start();
    try {
      const { base, mock } = scripted(['ok']);
      await createLimitedFetch(base)(read);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(mock).toHaveBeenCalledTimes(1);
    } finally {
      stop();
    }
  });

  it("n'interrompt pas une requete lente mais saine : si elle repond avant la relance, elle gagne", async () => {
    start();
    try {
      let answer: (r: Response) => void = () => undefined;
      const slow = vi.fn(() => new Promise<Response>((resolve) => (answer = resolve)));
      const pending = createLimitedFetch(slow as unknown as typeof fetch, { hedgeAfterMs: 3_000 })(read);

      await vi.advanceTimersByTimeAsync(2_000);
      answer(ok());

      await expect(pending).resolves.toHaveProperty('status', 200);
      await vi.advanceTimersByTimeAsync(10_000);
      expect(slow).toHaveBeenCalledTimes(1);
    } finally {
      stop();
    }
  });

  it("relance tout de suite si tout a echoue, jusqu'au nombre prevu, puis remonte la premiere erreur", async () => {
    const { base, mock } = scripted(['fail', 'fail', 'fail', 'ok']);
    await expect(createLimitedFetch(base, { hedges: 2 })(read)).rejects.toThrow('echec 1');
    expect(mock).toHaveBeenCalledTimes(3);
  });

  it('reussit si une tentative sur trois aboutit', async () => {
    const { base, mock } = scripted(['fail', 'fail', 'ok']);
    await expect(createLimitedFetch(base, { hedges: 2 })(read)).resolves.toHaveProperty('status', 200);
    expect(mock).toHaveBeenCalledTimes(3);
  });

  it('ne double jamais une ecriture, meme sans reponse', async () => {
    start();
    try {
      const { base, mock } = scripted(['hang']);
      void createLimitedFetch(base, { hedgeAfterMs: 3_000 })('https://p.supabase.co/rest/v1/students', { method: 'POST', body: '{}' }).catch(() => undefined);
      await vi.advanceTimersByTimeAsync(30_000);
      expect(mock).toHaveBeenCalledTimes(1);
    } finally {
      stop();
    }
  });

  it("respecte l'annulation demandee par l'appelant : pas de relance", async () => {
    const controller = new AbortController();
    controller.abort();
    const { base, mock } = scripted(['fail', 'ok']);

    await expect(createLimitedFetch(base)(read, { signal: controller.signal })).rejects.toThrow();
    expect(mock).toHaveBeenCalledTimes(1);
  });
});
