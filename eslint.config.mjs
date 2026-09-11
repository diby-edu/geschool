import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypeScript from 'eslint-config-next/typescript';

/**
 * Configuration plate ESLint.
 *
 * eslint-config-next 16 exporte directement des tableaux de config plate :
 * FlatCompat n'est plus necessaire, et l'utiliser fait meme echouer ESLint
 * (structure circulaire lors de la validation de l'ancien format).
 */

// Le client service_role contourne l'integralite de la RLS (ADR-013).
const restrictAdminClient = {
  name: '@/lib/supabase/admin',
  message:
    'Le client service_role contourne la RLS. Reserve aux workers et aux services (ADR-013). Utiliser @/lib/supabase/server.',
};

const config = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'solver-service/**',
      'src/types/database.ts', // fichier genere
      'next-env.d.ts',
    ],
  },

  ...nextCoreWebVitals,
  ...nextTypeScript,

  {
    name: 'projet/regles-generales',
    rules: {
      // Le typage explicite est la regle : any interdit
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
    },
  },

  /**
   * Cloisonnement du client service_role.
   *
   * Sans cette regle, l'import finit par se propager « juste pour debloquer »
   * et la RLS devient decorative.
   */
  {
    name: 'projet/cloisonnement-service-role',
    files: ['src/**/*.{ts,tsx}'],
    ignores: [
      'src/lib/supabase/admin.ts',
      'src/workers/**',
      'src/services/**',
      'src/lib/audit/**',
      // Frontiere d'authentification (ADR-013) : la resolution d'identifiant
      // s'execute AVANT qu'une session existe, donc la RLS ne peut pas
      // s'appliquer ; et lever le drapeau de premiere connexion passe par
      // l'Admin API. Ces usages sont dans la liste fermee des operations
      // service_role.
      'src/features/auth/service.ts',
      'src/features/auth/actions.ts',
    ],
    rules: {
      'no-restricted-imports': ['error', { paths: [restrictAdminClient] }],
    },
  },

  /**
   * Aucun composant ne parle directement a la base.
   *
   * Ce bloc reprend la restriction ci-dessus : en config plate, un bloc
   * ulterieur REMPLACE la valeur de la meme regle. Omettre `paths` ici
   * reautoriserait silencieusement le client admin dans les composants.
   */
  {
    name: 'projet/composants-sans-acces-base',
    files: ['src/**/components/**/*.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [restrictAdminClient],
          patterns: [
            {
              group: ['**/queries', '**/service', '@/lib/supabase/server'],
              message:
                'Un composant ne parle pas a la base. Passer par une Server Action ou recevoir les donnees en props.',
            },
          ],
        },
      ],
    },
  },

  /**
   * Scripts d'outillage : ce sont des programmes en ligne de commande, leur
   * sortie console EST leur interface. Le worker journalise de la meme facon.
   */
  {
    name: 'projet/scripts-cli',
    files: ['scripts/**/*.mjs', 'src/workers/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
];

export default config;
