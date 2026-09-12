import type { AppreciationInput } from './types';

/**
 * Générateur d'appréciation DÉTERMINISTE (sans appel externe).
 *
 * C'est le mode par défaut de la couche IA : il produit un texte réel et utile
 * à partir des seules données déjà retournées à l'utilisateur (moyennes, rang,
 * assiduité), sans jamais toucher la base ni un service tiers. Quand une clé LLM
 * est configurée, l'assistant s'appuie sur le modèle et retombe sur ces règles
 * en cas d'erreur — la fonctionnalité marche donc toujours.
 */
export function ruleBasedAppreciation(input: AppreciationInput): string {
  const parts: string[] = [];
  const g = input.generalAverage;
  const pass = input.passingScore;

  // Niveau général.
  if (g === null) {
    parts.push(`${firstName(input.studentName)} ne dispose pas encore de moyenne exploitable ce trimestre.`);
  } else {
    const tier =
      g >= pass + 4 ? 'excellent' : g >= pass + 2 ? 'très bon' : g >= pass ? 'satisfaisant' : g >= pass - 2 ? 'fragile' : 'insuffisant';
    const vsClass =
      input.classAverage !== null
        ? g >= input.classAverage
          ? ', au-dessus de la moyenne de la classe'
          : ', en deçà de la moyenne de la classe'
        : '';
    const rankPart = input.rank && input.classSize ? ` (rang ${input.rank} sur ${input.classSize})` : '';
    parts.push(
      `Trimestre ${tier} : moyenne générale de ${g.toFixed(2)}${vsClass}${rankPart}.`,
    );
  }

  // Points forts / faibles par matière.
  const graded = input.subjects.filter((s) => s.average !== null) as { name: string; average: number; classAverage: number | null }[];
  const strong = graded.filter((s) => s.average >= pass + 2).map((s) => s.name);
  const weak = graded.filter((s) => s.average < pass).map((s) => s.name);

  if (strong.length > 0) parts.push(`Points forts : ${list(strong)}.`);
  if (weak.length > 0) parts.push(`À consolider : ${list(weak)}.`);

  // Assiduité.
  if (input.absences > 0 || input.lateness > 0) {
    const bits: string[] = [];
    if (input.absences > 0) bits.push(`${input.absences} absence${input.absences > 1 ? 's' : ''}`);
    if (input.lateness > 0) bits.push(`${input.lateness} retard${input.lateness > 1 ? 's' : ''}`);
    parts.push(`Assiduité : ${bits.join(' et ')} à surveiller.`);
  }

  // Encouragement final, calibré sur le niveau.
  if (g !== null) {
    if (g >= pass + 2) parts.push('Continuez ainsi.');
    else if (g >= pass) parts.push('Des efforts réguliers permettront de progresser encore.');
    else parts.push('Un travail plus soutenu est attendu le trimestre prochain.');
  }

  return parts.join(' ');
}

function firstName(full: string): string {
  // "NOM Prénom" -> "Prénom" quand c'est possible, sinon le nom complet.
  const idx = full.indexOf(' ');
  return idx >= 0 ? full.slice(idx + 1) : full;
}

function list(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} et ${items[items.length - 1]}`;
}
