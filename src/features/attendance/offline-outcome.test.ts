import { describe, expect, it } from 'vitest';
import { classifyResponse } from './offline-outcome';

const json = 'application/json; charset=utf-8';

describe('classifyResponse — un appel fait hors ligne n’est jamais perdu', () => {
  it('enregistré : il quitte l’appareil', () => {
    expect(classifyResponse({ status: 200, redirected: false, contentType: json, body: { registerId: 'r1', submitted: true } })).toEqual({
      kind: 'ok',
      registerId: 'r1',
      submitted: true,
    });
  });

  it('session expirée (redirection vers la connexion) : il reste en attente', () => {
    expect(classifyResponse({ status: 200, redirected: true, contentType: 'text/html', body: null }).kind).toBe('login');
    expect(classifyResponse({ status: 401, redirected: false, contentType: json, body: {} }).kind).toBe('login');
  });

  it('serveur indisponible : il reste en attente et sera renvoyé', () => {
    expect(classifyResponse({ status: 503, redirected: false, contentType: 'text/html', body: null }).kind).toBe('retry');
    expect(classifyResponse({ status: 500, redirected: false, contentType: json, body: {} }).kind).toBe('retry');
    expect(classifyResponse({ status: 429, redirected: false, contentType: json, body: {} }).kind).toBe('retry');
  });

  it('refusé pour de bon : gardé avec la raison, jamais effacé en silence', () => {
    expect(
      classifyResponse({ status: 403, redirected: false, contentType: json, body: { error: { message: 'Hors créneau.' } } }),
    ).toEqual({ kind: 'refused', message: 'Hors créneau.' });
    expect(classifyResponse({ status: 409, redirected: false, contentType: json, body: {} }).kind).toBe('refused');
  });

  it('réponse 200 sans registre : on ne conclut pas, on réessaie', () => {
    expect(classifyResponse({ status: 200, redirected: false, contentType: json, body: {} }).kind).toBe('retry');
  });
});
