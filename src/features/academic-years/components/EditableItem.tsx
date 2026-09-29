'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

/**
 * Carte d'un élément de la fiche de l'année (trimestre, congé) : son contenu, et
 * à droite « Modifier » à côté de « Supprimer ». « Modifier » déplie le
 * formulaire sous l'en-tête, sans quitter la page.
 */
export function EditableItem({
  header,
  actions,
  editForm,
  footer,
  accent,
}: {
  header: React.ReactNode;
  /** Boutons à droite de « Modifier » (Supprimer). */
  actions?: React.ReactNode;
  editForm?: React.ReactNode;
  /** Contenu toujours visible sous l'en-tête (ex. calcul des moyennes). */
  footer?: React.ReactNode;
  /** Couleur du liseré gauche. */
  accent?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="overflow-hidden rounded-3xl border" style={{ backgroundColor: 'var(--surface)', ...(accent ? { borderLeft: `6px solid ${accent}` } : {}) }}>
      <div className="flex flex-wrap items-start justify-between gap-3 p-4 sm:p-5">
        <div className="min-w-0 flex-1">{header}</div>
        {editForm || actions ? (
          <div className="flex shrink-0 items-start gap-2">
            {editForm ? (
              <Button type="button" variant="secondary" size="sm" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
                {open ? 'Fermer' : 'Modifier'}
              </Button>
            ) : null}
            {actions}
          </div>
        ) : null}
      </div>
      {open && editForm ? <div className="border-t px-4 py-4 sm:px-5">{editForm}</div> : null}
      {footer}
    </div>
  );
}
