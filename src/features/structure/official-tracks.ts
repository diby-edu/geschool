/**
 * Niveaux officiels des ordres TECHNIQUE et PROFESSIONNEL (Côte d'Ivoire).
 *
 * Le général est déjà couvert par la grille officielle des coefficients
 * (features/programme/official-ci.ts). Ici, seuls les NIVEAUX : les matières et
 * leurs coefficients viennent ensuite, à la main ou par une grille officielle —
 * dans ces deux ordres, le coefficient vaut 1 par défaut et l'administration
 * l'ajuste.
 *
 * Les noms restent ceux de l'administration (« 1 BT COMPTA », « FQ Coiffure ») :
 * ils sont reconnus tels quels par les établissements, et modifiables.
 */

export type EducationTrack = 'GENERAL' | 'TECHNIQUE' | 'PROFESSIONNEL';

export type OfficialLevel = {
  /** Nom affiché, tel que l'administration l'écrit. */
  name: string;
  /** Code court, unique dans l'établissement. */
  code: string;
  /** Diplôme préparé (professionnel) : CAP, BEP, BT, CQP, FQ. */
  diploma: string | null;
  sequence: number;
};

/** Séries du technique : seconde, première, terminale (série AB en seconde, B ensuite). */
const TECHNIQUE_RAW = [
  '2NDE AB',
  '1ERE B',
  'TLE B',
  '2NDE F1',
  '1ERE F1',
  'TLE F1',
  '2NDE F2',
  '1ERE F2',
  'TLE F2',
  '2NDE F3',
  '1ERE F3',
  'TLE F3',
  '2NDE G1',
  '1ERE G1',
  'TLE G1',
  '2NDE G2',
  '1ERE G2',
  'TLE G2',
  '2NDE T3',
  '1ERE F7',
  'TLE F7',
];

/** Classes de la formation professionnelle, par diplôme (liste de l'administration). */
const PROFESSIONNEL_RAW = `1 BEP COMPTA
2 BEP COMPTA
1 BEP ELECTRO
2 BEP ELECTRO
1 BEP SECR
2 BEP SECR
1 BT CUI PRO
2 BT CUI PRO
3 BT CUI PRO
1 BT SC MEDSCO
2 BT SC MEDSCO
3 BT SC MEDSCO
1 BT TECH HOT
2 BT TECH HOT
3 BT TECH HOT
1 BT COMPTA
2 BT COMPTA
3 BT COMPTA
1 BT COMPTA-COM
2 BT COMPTA-COM
3 BT COMPTA-COM
1 BT BT SEC
2 BT BT SEC
3 BT BT SEC
1 BT CONT QUAL
2 BT CONT QUAL
3 BT CONT QUAL
1 BT TR TRANSP
2 BT TR TRANSP
3 BT TR TRANSP
1 BT ELECT
2 BT ELECT
3 BT ELECT
1 BT MEC AUTO
2 BT MEC AUTO
3 BT MEC AUTO
1 BT MEC GEN
2 BT MEC GEN
3 BT MEC GEN
1 BT CONS MET
2 BT CONS MET
3 BT CONS MET
1 BT PLOMB
2 BT PLOMB
3 BT PLOMB
1 BT ELEC BAT
2 BT ELEC BAT
3 BT ELEC BAT
1 BT MEC SOUD
2 BT MEC SOUD
3 BT MEC SOUD
1 BT IMPR
2 BT IMPR
3 BT IMPR
1 BT BAT
2 BT BAT
3 BT BAT
1 BT COIF
2 BT COIF
3 BT COIF
1 BT COUT
2 BT COUT
3 BT COUT
1 BT EMPL HOT
2 BT EMPL HOT
3 BT EMPL HOT
1 CAP PAT
2 CAP PAT
3 CAP PAT
1 CAP MEC GEN
2 CAP MEC GEN
3 CAP MEC GEN
1 CAP CONS MET
2 CAP CONS MET
3 CAP CONS MET
1 CAP PLOMB
2 CAP PLOMB
3 CAP PLOMB
1 CAP ELEC BAT
2 CAP ELEC BAT
3 CAP ELEC BAT
1 CAP AGRO MEC
2 CAP AGRO MEC
3 CAP AGRO MEC
1 CAP MEC AUTO
2 CAP MEC AUTO
3 CAP MEC AUTO
1 CAP ESTHE
2 CAP ESTHE
3 CAP ESTHE
1 CAP CO COUT
2 CAP CO COUT
3 CAP CO COUT
1 CAP ELECTR
2 CAP ELECTR
3 CAP ELECTR
1 CAP ELEC EQUIP
2 CAP ELEC EQUIP
3 CAP ELEC EQUIP
1 CAP MACO
2 CAP MACO
3 CAP MACO
1 CAP MENUIS
2 CAP MENUIS
3 CAP MENUIS
1 CAP PL SANIT
2 CAP PL SANIT
3 CAP PL SANIT
CQP CUIS
1 CQP AGRO MEC
2 CQP AGRO MEC
1 CQP CONS MET
2 CQP CONS MET
CQP PATIS
1 CQP MEC AUTO
2 CQP MEC AUTO
FQ Aide Soignante
FQ Caissiere special
FQ Coupe couture
FQ Caisse supermarch
FQ Energie solaire
Informatique, reseau
FQ NTIC
FQ Gestion commercia
FQ Technicien agrico
FQ Agent de service
FQ Agent de liaison
FQ Aide nutritionnis
FQ Brancardier
FQ Transit douane
FQ Secretariat burea
FQ Auxilliaire en ph
FQ Secretariat compt
FQ Caisse+auxilliair
FQ Operateur de sais
FQ Secretaire medica
FQ Securite electron
FQ Infographie
FQ Webmaster
FQ Delegue medical
FQ Caisse etablissem
FQ Esthetique
FQ Coiffure
FQ Couture
FQ Coiffure et esthe
FQ Patisserie
FQ Cuisine professio
FQ Decoration
FQ Communication dig
FQ Infographie - inf
FQ electricite
FQ Plomberie`;

const DIPLOMAS = ['BEP', 'BT', 'CAP', 'CQP', 'FQ'] as const;

/** Diplôme lu dans le nom (« 2 CAP PLOMB » → CAP) ; null quand le nom n'en porte pas. */
export function diplomaOf(name: string): string | null {
  const words = name.toUpperCase().split(/[\s-]+/);
  return DIPLOMAS.find((d) => words.includes(d)) ?? null;
}

/** Code court, lisible et unique : « 1 BT COMPTA-COM » → « 1-BT-COMPTA-COM ». */
export function levelCode(name: string, taken: Set<string>): string {
  const base = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 22);
  let code = base || 'NIVEAU';
  let n = 2;
  while (taken.has(code)) code = `${base.slice(0, 20)}-${n++}`;
  taken.add(code);
  return code;
}

function build(names: readonly string[]): OfficialLevel[] {
  const taken = new Set<string>();
  return names.map((name, i) => ({ name, code: levelCode(name, taken), diploma: diplomaOf(name), sequence: i + 1 }));
}

export const OFFICIAL_TRACK_LEVELS: Record<'TECHNIQUE' | 'PROFESSIONNEL', { cycleCode: string; cycleName: string; levels: OfficialLevel[] }> = {
  TECHNIQUE: { cycleCode: 'TECH', cycleName: 'Enseignement technique', levels: build(TECHNIQUE_RAW) },
  PROFESSIONNEL: {
    cycleCode: 'PRO',
    cycleName: 'Formation professionnelle',
    levels: build(PROFESSIONNEL_RAW.split('\n').map((l) => l.trim()).filter(Boolean)),
  },
};

export const TRACK_LABELS: Record<EducationTrack, string> = {
  GENERAL: 'Enseignement général',
  TECHNIQUE: 'Enseignement technique',
  PROFESSIONNEL: 'Formation professionnelle',
};
