'use client';

import { Button } from '@/components/ui/button';

/** Impression du bulletin (Enregistrer en PDF via le navigateur). */
export function PrintButton() {
  return (
    <Button type="button" variant="secondary" size="sm" className="no-print" onClick={() => window.print()}>
      Imprimer / PDF
    </Button>
  );
}
