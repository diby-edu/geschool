'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import type { FormState } from '@/lib/forms';

/** « Faire une sauvegarde » : toute l'école, ou une année. */
export function CreateBackupForm({ action, years }: { action: (p: FormState, fd: FormData) => Promise<FormState>; years: { id: string; name: string }[] }) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const [scope, setScope] = useState<'SCHOOL' | 'YEAR'>('SCHOOL');
  const [pending, start] = useTransition();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(() => formAction(fd));
      }}
      className="space-y-2 text-sm"
    >
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      <label className="flex cursor-pointer items-start gap-2 rounded-xl border p-3" style={{ borderColor: scope === 'SCHOOL' ? 'var(--color-brand)' : 'var(--border)' }}>
        <input type="radio" name="scope" value="SCHOOL" checked={scope === 'SCHOOL'} onChange={() => setScope('SCHOOL')} className="mt-1" />
        <span>
          <b>Toute l’école</b>
          <span className="block text-xs text-[color:var(--muted-foreground)]">Toutes les années, toutes les données.</span>
        </span>
      </label>
      <label className="flex cursor-pointer items-start gap-2 rounded-xl border p-3" style={{ borderColor: scope === 'YEAR' ? 'var(--color-brand)' : 'var(--border)' }}>
        <input type="radio" name="scope" value="YEAR" checked={scope === 'YEAR'} onChange={() => setScope('YEAR')} className="mt-1" />
        <span className="flex-1">
          <b>Une année scolaire</b>{' '}
          <select name="yearId" className="ml-1 rounded-lg border px-2 py-1 text-sm" style={{ borderColor: 'var(--border)' }} onFocus={() => setScope('YEAR')}>
            {years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
              </option>
            ))}
          </select>
          <span className="block text-xs text-[color:var(--muted-foreground)]">
            Notes, présences, emplois du temps, bulletins de cette année — avec les élèves, classes et paramètres, pour pouvoir la remettre.
          </span>
        </span>
      </label>
      <Button type="submit" disabled={pending}>
        {pending ? 'Lancement…' : 'Faire la sauvegarde'}
      </Button>
      <p className="text-xs text-[color:var(--muted-foreground)]">
        Elle se prépare en arrière-plan (1 à 3 minutes pour un grand lycée) et apparaît dans la liste. Vous pouvez continuer à travailler.
      </p>
    </form>
  );
}

/** Envoyer un fichier .gsbak téléchargé plus tôt, pour le remettre. */
export function UploadBackup({ slug }: { slug: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const send = async (file: File) => {
    setError(null);
    if (!file.name.endsWith('.gsbak')) {
      setError('Choisissez un fichier .gsbak téléchargé depuis cette page.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/e/${slug}/sauvegardes/envoyer`, { method: 'POST', body: file, headers: { 'Content-Type': 'application/octet-stream' } });
      const out = (await res.json().catch(() => ({ ok: false, error: 'Envoi impossible (fichier trop gros, ou connexion coupée).' }))) as { ok: boolean; id?: string; error?: string };
      if (out.ok && out.id) router.push(`/e/${slug}/sauvegardes/${out.id}/remettre`);
      else setError(out.error ?? 'Envoi impossible.');
    } catch {
      setError('Envoi impossible : la connexion a été coupée.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2">
      {error ? <Alert tone="error">{error}</Alert> : null}
      <label
        className="block cursor-pointer rounded-xl border-2 border-dashed p-5 text-center text-sm text-[color:var(--muted-foreground)]"
        style={{ borderColor: 'var(--border)' }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files[0];
          if (f) void send(f);
        }}
      >
        {busy ? (
          'Envoi et vérification du fichier…'
        ) : (
          <>
            Glissez ici un fichier <b>.gsbak</b> téléchargé depuis cette page, ou <span className="font-bold text-[color:var(--color-brand)]">choisissez-le</span>
          </>
        )}
        <input
          type="file"
          accept=".gsbak"
          className="hidden"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void send(f);
          }}
        />
      </label>
      <p className="text-xs text-[color:var(--muted-foreground)]">
        L’application vérifie que le fichier vient bien de votre école et qu’il n’a pas été modifié (signature). Un fichier retouché, ou d’une autre école, est refusé.
      </p>
    </div>
  );
}

type Cat = { key: string; label: string; hint: string; mode: string; inBackup: number; today: number; pulls: string[] };

/** La remise : tout, ou les catégories cochées ; confirmation par le nom de l'école. */
export function RestoreForm({
  action,
  categories,
  schoolName,
}: {
  action: (p: FormState, fd: FormData) => Promise<FormState>;
  categories: Cat[];
  schoolName: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<'ALL' | 'SOME'>('SOME');
  const [checked, setChecked] = useState<string[]>([]);
  const [confirm, setConfirm] = useState('');
  const labelOf = new Map(categories.map((c) => [c.key, c.label]));
  const pulled = [...new Set(checked.flatMap((k) => categories.find((c) => c.key === k)?.pulls ?? []))].filter((k) => !checked.includes(k));
  const replace = categories.filter((c) => c.mode === 'replace' || c.mode === 'settings');
  const base = categories.filter((c) => c.mode === 'add' || c.mode === 'roles');
  const toggle = (k: string) => setChecked((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));
  const nf = (n: number) => n.toLocaleString('fr-FR');

  const group = (title: string, pill: string, hint: string, items: Cat[]) => (
    <div>
      <p className="mb-1 text-sm font-bold">
        {title} <span className="ml-1 rounded-full bg-[color:var(--border)] px-2 py-0.5 text-[11px] font-semibold">{pill}</span>
      </p>
      <p className="mb-2 text-xs text-[color:var(--muted-foreground)]">{hint}</p>
      <div className="space-y-1">
        {items.map((c) => (
          <label key={c.key} className="flex items-start gap-2 rounded-lg border p-2 text-sm" style={{ borderColor: 'var(--border)', opacity: mode === 'ALL' ? 0.6 : 1 }}>
            <input
              type="checkbox"
              name="category"
              value={c.key}
              disabled={mode === 'ALL'}
              checked={mode === 'ALL' || checked.includes(c.key) || pulled.includes(c.key)}
              onChange={() => toggle(c.key)}
              className="mt-1"
            />
            <span className="flex-1">
              <b>{c.label}</b> {c.hint ? <span className="text-xs text-[color:var(--muted-foreground)]">({c.hint})</span> : null}
              <span className="block text-xs text-[color:var(--muted-foreground)]">
                dans la sauvegarde : {nf(c.inBackup)} · aujourd’hui : {nf(c.today)}
                {pulled.includes(c.key) ? ' · ajoutée car elle dépend d’une catégorie cochée' : ''}
              </span>
            </span>
          </label>
        ))}
      </div>
    </div>
  );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        if (mode === 'SOME') for (const k of pulled) fd.append('category', k);
        start(() => formAction(fd));
      }}
      className="space-y-4"
    >
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      <input type="hidden" name="mode" value={mode} />
      <div className="grid gap-2 md:grid-cols-2">
        <label className="flex cursor-pointer items-start gap-2 rounded-xl border p-3 text-sm" style={{ borderColor: mode === 'ALL' ? 'var(--color-brand)' : 'var(--border)' }}>
          <input type="radio" checked={mode === 'ALL'} onChange={() => setMode('ALL')} className="mt-1" />
          <span>
            <b>Tout remettre</b>
            <span className="block text-xs text-[color:var(--muted-foreground)]">L’école revient comme à la date de la sauvegarde. Tout ce qui a été fait depuis est perdu pour elle.</span>
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-2 rounded-xl border p-3 text-sm" style={{ borderColor: mode === 'SOME' ? 'var(--color-brand)' : 'var(--border)' }}>
          <input type="radio" checked={mode === 'SOME'} onChange={() => setMode('SOME')} className="mt-1" />
          <span>
            <b>Choisir les catégories</b>
            <span className="block text-xs text-[color:var(--muted-foreground)]">Le reste de l’école ne bouge pas.</span>
          </span>
        </label>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        {group('Données du quotidien et paramètres', 'remplacées', 'Celles d’aujourd’hui sont remplacées par celles de la sauvegarde.', replace)}
        {group('Données de base', 'ajout seulement', 'On recrée ce qui a été supprimé ; rien de ce qui existe n’est effacé.', base)}
      </div>
      {pulled.length > 0 && mode === 'SOME' ? (
        <Alert tone="warning">
          Remettre {checked.map((k) => labelOf.get(k)).join(', ')} entraîne aussi : <b>{pulled.map((k) => labelOf.get(k)).join(', ')}</b> (elles en dépendent, sinon des données
          pointeraient dans le vide).
        </Alert>
      ) : null}
      <Alert tone="info">
        Une sauvegarde de l’état actuel est faite d’abord, toute seule. Les comptes de connexion, les mots de passe, l’abonnement et les SMS ne changent pas. Une ligne dont un lien
        obligatoire n’existe plus (par exemple la note d’un élève supprimé depuis) n’est pas remise : le compte rendu le dira.
      </Alert>
      <div className="space-y-2">
        <label className="block text-sm font-bold" htmlFor="confirm">
          Pour confirmer, tapez le nom de l’école : <span className="font-normal">{schoolName}</span>
        </label>
        <input
          id="confirm"
          name="confirm"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="off"
          className="w-full rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: 'var(--border)' }}
        />
        <Button type="submit" variant="danger" disabled={pending || (mode === 'SOME' && checked.length === 0) || confirm.trim() === ''}>
          {pending ? 'Lancement…' : mode === 'ALL' ? 'Tout remettre' : 'Remettre les catégories cochées'}
        </Button>
      </div>
    </form>
  );
}

/** Tant qu'une sauvegarde ou une remise tourne : la page se met à jour toute seule. */
export function AutoRefresh({ seconds = 15 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}
