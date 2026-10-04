import { describe, it, expect } from 'vitest';
import {
  countSchools,
  filterSchools,
  parseSchoolFilters,
  schoolsHref,
  type FilterableSchool,
} from './filters';

const MAINTENANT = new Date('2026-10-04T12:00:00Z');
const dans = (jours: number) => new Date(MAINTENANT.getTime() + jours * 86_400_000).toISOString();

function ecole(over: Partial<FilterableSchool> & { name: string }): FilterableSchool {
  return {
    slug: over.name.toLowerCase().replace(/\s+/g, '-'),
    city: null,
    status: 'ACTIVE',
    disabledModules: 0,
    subscription: null,
    ...over,
  };
}

const LISTE: FilterableSchool[] = [
  ecole({ name: 'Lycée Moderne', city: 'Abidjan', subscription: { status: 'ACTIVE', trialEndsOn: null } }),
  ecole({ name: 'Collège Saint-Paul', status: 'SUSPENDED', disabledModules: 2 }),
  ecole({ name: 'Groupe Kédougou', status: 'PENDING', subscription: { status: 'TRIALING', trialEndsOn: dans(12) } }),
  ecole({ name: 'Institut Nord', subscription: { status: 'TRIALING', trialEndsOn: dans(90) } }),
  ecole({ name: 'École Sud', status: 'ARCHIVED', subscription: { status: 'PAST_DUE', trialEndsOn: null } }),
  ecole({ name: 'Cours Privé', disabledModules: 1 }),
];

const noms = (rows: FilterableSchool[]) => rows.map((r) => r.name);

describe('lecture des filtres dans l’URL', () => {
  it('retient les valeurs connues', () => {
    expect(parseSchoolFilters({ statut: 'suspended', abonnement: 'ESSAI', modules: 'reduits', q: ' nord ' })).toEqual({
      statut: 'SUSPENDED',
      abonnement: 'essai',
      modulesReduits: true,
      q: 'nord',
    });
  });

  it('ignore une valeur inventée plutôt que de refuser la page', () => {
    const f = parseSchoolFilters({ statut: 'FERMEE', abonnement: 'gratuit', modules: 'oui' });
    expect(f).toEqual({ statut: null, abonnement: null, modulesReduits: false, q: '' });
  });
});

describe('restriction de la liste', () => {
  it('par état de l’établissement', () => {
    expect(noms(filterSchools(LISTE, parseSchoolFilters({ statut: 'SUSPENDED' }), MAINTENANT))).toEqual([
      'Collège Saint-Paul',
    ]);
  });

  it('par abonnement', () => {
    const essai = filterSchools(LISTE, parseSchoolFilters({ abonnement: 'essai' }), MAINTENANT);
    expect(noms(essai)).toEqual(['Groupe Kédougou', 'Institut Nord']);
    expect(noms(filterSchools(LISTE, parseSchoolFilters({ abonnement: 'retard' }), MAINTENANT))).toEqual(['École Sud']);
    expect(noms(filterSchools(LISTE, parseSchoolFilters({ abonnement: 'aucun' }), MAINTENANT))).toEqual([
      'Collège Saint-Paul',
      'Cours Privé',
    ]);
  });

  it('un essai qui se termine, c’est dans les trente jours — pas dans trois mois', () => {
    expect(noms(filterSchools(LISTE, parseSchoolFilters({ abonnement: 'essai-bientot' }), MAINTENANT))).toEqual([
      'Groupe Kédougou',
    ]);
  });

  it('par modules coupés', () => {
    expect(noms(filterSchools(LISTE, parseSchoolFilters({ modules: 'reduits' }), MAINTENANT))).toEqual([
      'Collège Saint-Paul',
      'Cours Privé',
    ]);
  });

  it('la recherche ignore accents et casse, et regarde la ville', () => {
    expect(noms(filterSchools(LISTE, parseSchoolFilters({ q: 'kedougou' }), MAINTENANT))).toEqual(['Groupe Kédougou']);
    expect(noms(filterSchools(LISTE, parseSchoolFilters({ q: 'ABIDJAN' }), MAINTENANT))).toEqual(['Lycée Moderne']);
  });

  it('les filtres se cumulent', () => {
    const f = parseSchoolFilters({ statut: 'ACTIVE', modules: 'reduits' });
    expect(noms(filterSchools(LISTE, f, MAINTENANT))).toEqual(['Cours Privé']);
  });

  it('sans filtre, la liste entière', () => {
    expect(filterSchools(LISTE, parseSchoolFilters({}), MAINTENANT)).toHaveLength(LISTE.length);
  });
});

describe('compteurs des pastilles', () => {
  it('comptent toute la liste, pas le filtre en cours', () => {
    const c = countSchools(LISTE, MAINTENANT);
    expect(c.total).toBe(6);
    expect(c.statut).toEqual({ ACTIVE: 3, PENDING: 1, SUSPENDED: 1, ARCHIVED: 1 });
    expect(c.abonnement.actif).toBe(1);
    expect(c.abonnement.essai).toBe(2);
    expect(c.abonnement['essai-bientot']).toBe(1);
    expect(c.abonnement.retard).toBe(1);
    expect(c.abonnement.aucun).toBe(2);
    expect(c.modulesReduits).toBe(2);
  });

  it('chaque compteur mène à une liste de la même taille', () => {
    const c = countSchools(LISTE, MAINTENANT);
    for (const [statut, n] of Object.entries(c.statut)) {
      expect(filterSchools(LISTE, parseSchoolFilters({ statut }), MAINTENANT)).toHaveLength(n);
    }
    for (const [abonnement, n] of Object.entries(c.abonnement)) {
      expect(filterSchools(LISTE, parseSchoolFilters({ abonnement }), MAINTENANT)).toHaveLength(n);
    }
    expect(filterSchools(LISTE, parseSchoolFilters({ modules: 'reduits' }), MAINTENANT)).toHaveLength(c.modulesReduits);
  });
});

describe('adresses des filtres', () => {
  it('sans filtre, l’adresse reste nue', () => {
    expect(schoolsHref({})).toBe('/admin/etablissements');
  });

  it('un filtre, puis plusieurs', () => {
    expect(schoolsHref({ statut: 'SUSPENDED' })).toBe('/admin/etablissements?statut=SUSPENDED');
    expect(schoolsHref({ abonnement: 'essai-bientot', modulesReduits: true })).toBe(
      '/admin/etablissements?abonnement=essai-bientot&modules=reduits',
    );
  });
});
