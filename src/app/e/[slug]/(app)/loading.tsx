/**
 * Affiché AUSSITÔT après un clic, pendant que le serveur prépare la page
 * (constaté le 2026-10-28 : sans lui, l'ancienne page restait figée jusqu'à
 * deux secondes et l'on recliquait, croyant que le lien ne marchait pas).
 * Même silhouette que les pages : un bandeau, puis des lignes.
 */
export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl animate-pulse space-y-5" aria-busy="true" aria-label="Chargement de la page">
      <div className="h-28 rounded-3xl" style={{ background: 'color-mix(in srgb, var(--color-brand) 22%, var(--surface))' }} />
      <div className="flex gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-10 w-32 rounded-xl" style={{ background: 'var(--border)' }} />
        ))}
      </div>
      <div className="space-y-2 rounded-2xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-8 rounded-lg" style={{ background: 'var(--border)', opacity: 1 - i * 0.12 }} />
        ))}
      </div>
    </div>
  );
}
