import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TenantContext } from '@/lib/tenant/context';

// assessments.ts tire le client Supabase serveur, l'audit et la resolution de la
// fiche enseignant : on ne teste ici que la decision d'acces.
vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/audit', () => ({ audit: vi.fn() }));
const getMyTeacherId = vi.fn<() => Promise<string | null>>();
vi.mock('@/features/teachers/my-scope', () => ({ getMyTeacherId: () => getMyTeacherId() }));

import { assessmentAccess, canActOnAssessment, requireAssessmentAccess } from './assessments';
import { AuthorizationError } from '@/lib/errors';

const ME = 'teacher-me';
const COLLEAGUE = 'teacher-colleague';

function ctx(over: { permissions?: string[]; isPlatformAdmin?: boolean; status?: string } = {}): TenantContext {
  return {
    school: { id: 's1', status: over.status ?? 'ACTIVE' },
    isPlatformAdmin: over.isPlatformAdmin ?? false,
    permissions: new Set(over.permissions ?? []),
  } as unknown as TenantContext;
}

// Ce que le role Enseignant detient depuis 0051 : pas de droit general sur les evaluations.
const TEACHER_PERMISSIONS = ['assessments.view', 'assessments.create', 'grades.view'];
const TEACHER = ctx({ permissions: TEACHER_PERMISSIONS });
const DIRECTION = ctx({ permissions: ['assessments.view', 'assessments.update', 'assessments.delete', 'grades.create'] });

beforeEach(() => {
  getMyTeacherId.mockReset();
  getMyTeacherId.mockResolvedValue(ME);
});

describe('assessmentAccess', () => {
  it('un enseignant agit sur SES evaluations : modifier, supprimer, noter', async () => {
    expect(await assessmentAccess(TEACHER, { teacher_id: ME })).toEqual({ update: true, delete: true, grade: true });
  });

  it('un enseignant n agit sur aucune evaluation d un collegue', async () => {
    expect(await assessmentAccess(TEACHER, { teacher_id: COLLEAGUE })).toEqual({ update: false, delete: false, grade: false });
  });

  it('la direction agit sur celle de n importe quel enseignant, sans lire de fiche enseignant', async () => {
    expect(await assessmentAccess(DIRECTION, { teacher_id: COLLEAGUE })).toEqual({ update: true, delete: true, grade: true });
    expect(getMyTeacherId).not.toHaveBeenCalled();
  });

  it('le Super Admin passe partout', async () => {
    const admin = ctx({ isPlatformAdmin: true });
    expect(await assessmentAccess(admin, { teacher_id: COLLEAGUE })).toEqual({ update: true, delete: true, grade: true });
  });

  it('une evaluation sans enseignant n a pas de proprietaire : refusee a l enseignant, sans requete', async () => {
    expect(await assessmentAccess(TEACHER, { teacher_id: null })).toEqual({ update: false, delete: false, grade: false });
    expect(getMyTeacherId).not.toHaveBeenCalled();
  });

  it('un membre sans fiche enseignant n est proprietaire de rien', async () => {
    getMyTeacherId.mockResolvedValue(null);
    expect(await assessmentAccess(TEACHER, { teacher_id: ME })).toEqual({ update: false, delete: false, grade: false });
  });

  it('ne lit la fiche enseignant qu une fois pour les trois actions', async () => {
    await assessmentAccess(TEACHER, { teacher_id: ME });
    expect(getMyTeacherId).toHaveBeenCalledTimes(1);
  });

  it('une permission generale isolee n en ouvre qu une : grades.create seul ne permet pas de modifier', async () => {
    const onlyGrades = ctx({ permissions: ['grades.create'] });
    expect(await assessmentAccess(onlyGrades, { teacher_id: COLLEAGUE })).toEqual({ update: false, delete: false, grade: true });
  });
});

describe('canActOnAssessment', () => {
  it('lit une action precise', async () => {
    expect(await canActOnAssessment(TEACHER, { teacher_id: ME }, 'update')).toBe(true);
    expect(await canActOnAssessment(TEACHER, { teacher_id: COLLEAGUE }, 'update')).toBe(false);
  });
});

describe('requireAssessmentAccess', () => {
  it('laisse passer le proprietaire', async () => {
    await expect(requireAssessmentAccess(TEACHER, { teacher_id: ME }, 'grade')).resolves.toBeUndefined();
  });

  it('refuse un collegue avec une erreur d autorisation', async () => {
    await expect(requireAssessmentAccess(TEACHER, { teacher_id: COLLEAGUE }, 'update')).rejects.toBeInstanceOf(AuthorizationError);
    await expect(requireAssessmentAccess(TEACHER, { teacher_id: COLLEAGUE }, 'delete')).rejects.toBeInstanceOf(AuthorizationError);
    await expect(requireAssessmentAccess(TEACHER, { teacher_id: COLLEAGUE }, 'grade')).rejects.toBeInstanceOf(AuthorizationError);
  });

  it('laisse passer la direction', async () => {
    await expect(requireAssessmentAccess(DIRECTION, { teacher_id: COLLEAGUE }, 'update')).resolves.toBeUndefined();
  });

  it('refuse meme le proprietaire quand l etablissement est en lecture seule', async () => {
    const suspended = ctx({ permissions: TEACHER_PERMISSIONS, status: 'SUSPENDED' });
    await expect(requireAssessmentAccess(suspended, { teacher_id: ME }, 'update')).rejects.toBeInstanceOf(AuthorizationError);
  });
});
