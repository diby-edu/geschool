/**
 * Types de la base de donnees.
 *
 * FICHIER GENERE — ne pas editer a la main.
 * Regeneration :  pnpm db:types
 *
 * Ce fichier est volontairement versionne : la CI doit pouvoir typer le projet
 * sans acces reseau a Supabase.
 *
 * Etat actuel : GABARIT VIDE. Aucune migration n'a encore ete appliquee
 * (lot 2 du plan d'implementation). Il sera remplace integralement des la
 * premiere generation.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: Record<never, never>;
    Views: Record<never, never>;
    Functions: Record<never, never>;
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};
