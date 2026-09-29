import {
  AuthApiError,
  AuthInvalidJwtError,
  AuthRetryableFetchError,
  AuthSessionMissingError,
  type JwtPayload,
  type User,
} from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { getClaimsWithRetry, getUserWithRetry } from './get-user';

const user = { id: 'u1' } as User;
const found = { data: { user }, error: null };
const network = { data: { user: null }, error: new AuthRetryableFetchError('fetch failed', 0) };
const noSession = { data: { user: null }, error: new AuthSessionMissingError() };

function clientReturning(...results: unknown[]) {
  const getUser = vi.fn();
  for (const r of results) getUser.mockResolvedValueOnce(r);
  return { client: { auth: { getUser } } as unknown as Parameters<typeof getUserWithRetry>[0], getUser };
}

describe('getUserWithRetry', () => {
  it("rend l'utilisateur des le premier appel", async () => {
    const { client, getUser } = clientReturning(found);
    await expect(getUserWithRetry(client)).resolves.toBe(user);
    expect(getUser).toHaveBeenCalledTimes(1);
  });

  it("rejoue apres une panne reseau et retrouve l'utilisateur", async () => {
    const { client, getUser } = clientReturning(network, network, found);
    await expect(getUserWithRetry(client)).resolves.toBe(user);
    expect(getUser).toHaveBeenCalledTimes(3);
  });

  it('rend null, apres trois essais, si le reseau ne revient pas (la garde ferme)', async () => {
    const { client, getUser } = clientReturning(network, network, network, found);
    await expect(getUserWithRetry(client)).resolves.toBeNull();
    expect(getUser).toHaveBeenCalledTimes(3);
  });

  it("ne rejoue pas un visiteur sans session, ni un jeton refuse : ce n'est pas une panne", async () => {
    const anonymous = clientReturning(noSession);
    await expect(getUserWithRetry(anonymous.client)).resolves.toBeNull();
    expect(anonymous.getUser).toHaveBeenCalledTimes(1);

    const refused = clientReturning({ data: { user: null }, error: new AuthApiError('invalid JWT', 401, 'bad_jwt') });
    await expect(getUserWithRetry(refused.client)).resolves.toBeNull();
    expect(refused.getUser).toHaveBeenCalledTimes(1);
  });
});

describe('getClaimsWithRetry', () => {
  const claims = { sub: 'u1', session_id: 's1' } as JwtPayload;
  const verified = { data: { claims, header: {}, signature: new Uint8Array() }, error: null };

  function claimsClient(...results: unknown[]) {
    const getClaims = vi.fn();
    for (const r of results) getClaims.mockResolvedValueOnce(r);
    return { client: { auth: { getClaims } } as unknown as Parameters<typeof getClaimsWithRetry>[0], getClaims };
  }

  it('rend les revendications verifiees des le premier appel', async () => {
    const { client, getClaims } = claimsClient(verified);
    await expect(getClaimsWithRetry(client)).resolves.toBe(claims);
    expect(getClaims).toHaveBeenCalledTimes(1);
  });

  it('rejoue une panne reseau (cle publique ou rafraichissement du jeton injoignable)', async () => {
    const network = { data: null, error: new AuthRetryableFetchError('fetch failed', 0) };
    const { client, getClaims } = claimsClient(network, verified);
    await expect(getClaimsWithRetry(client)).resolves.toBe(claims);
    expect(getClaims).toHaveBeenCalledTimes(2);
  });

  it('ne rejoue ni un visiteur sans session, ni une signature refusee', async () => {
    const anonymous = claimsClient({ data: null, error: null });
    await expect(getClaimsWithRetry(anonymous.client)).resolves.toBeNull();
    expect(anonymous.getClaims).toHaveBeenCalledTimes(1);

    const forged = claimsClient({ data: null, error: new AuthInvalidJwtError('Invalid JWT signature') });
    await expect(getClaimsWithRetry(forged.client)).resolves.toBeNull();
    expect(forged.getClaims).toHaveBeenCalledTimes(1);
  });
});
