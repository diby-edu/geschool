import { describe, expect, it } from 'vitest';
import { offsetFrom } from './server-clock';

describe('offsetFrom — écart entre le téléphone et le serveur', () => {
  it('téléphone en retard d’une heure (il affiche 7h, il est 8h) : +1 h', () => {
    const phoneSent = Date.parse('2026-10-14T07:00:00.000Z');
    const phoneReceived = phoneSent + 200;
    const off = offsetFrom('Wed, 14 Oct 2026 08:00:00 GMT', phoneSent, phoneReceived);
    // à la seconde près (en-tête Date tronqué)
    expect(Math.abs((off ?? 0) - 3_600_000)).toBeLessThanOrEqual(1000);
  });

  it('téléphone à l’heure : écart quasi nul', () => {
    const t = Date.parse('2026-10-14T08:00:00.000Z');
    expect(Math.abs(offsetFrom('Wed, 14 Oct 2026 08:00:00 GMT', t, t + 100) ?? 99_999)).toBeLessThanOrEqual(1000);
  });

  it('en-tête absent ou illisible : pas de mesure', () => {
    expect(offsetFrom(null, 0, 1)).toBeNull();
    expect(offsetFrom('pas une date', 0, 1)).toBeNull();
  });
});
