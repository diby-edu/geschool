'use client';

import { useActionState, useState, useTransition } from 'react';
import { Alert } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import type { MessageFormState } from '../messages-actions';

type Target = 'ALL' | 'TRIALING' | 'PAID' | 'EXPIRED' | 'SCHOOLS';
type Audience = 'DIRECTION' | 'STAFF' | 'TEACHERS' | 'GUARDIANS';

const AUDIENCE_LABEL: Record<Audience, string> = {
  DIRECTION: 'La direction (fondateur, directeur, censeur…)',
  STAFF: 'Tout le personnel',
  TEACHERS: 'Les enseignants',
  GUARDIANS: 'Les parents',
};

/**
 * Écrire aux écoles (lot 5, maquette docs/maquettes/super-admin-messages.html).
 * Champs contrôlés : le formulaire garde sa saisie entre « Voir combien » et
 * « Confirmer l'envoi ». L'envoi passe par onSubmit et non par `action` :
 * React remet un formulaire `action` à son état d'origine après chaque envoi,
 * et les cases cochées revenaient à l'écran sur « Toutes les écoles » alors que
 * le compte portait sur une seule (vu le 2026-10-26). Danger : la confirmation
 * serait partie à toutes les écoles.
 */
export function MessageForm({
  action,
  schools,
  counts,
  pricePerSms,
}: {
  action: (prev: MessageFormState, fd: FormData) => Promise<MessageFormState>;
  schools: { id: string; name: string }[];
  counts: Record<Exclude<Target, 'SCHOOLS'>, number>;
  pricePerSms: number;
}) {
  const [state, formAction] = useActionState<MessageFormState, FormData>(action, {});
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [importance, setImportance] = useState<'INFO' | 'IMPORTANT'>('INFO');
  const [showUntil, setShowUntil] = useState('');
  const [target, setTarget] = useState<Target>('ALL');
  const [picked, setPicked] = useState<string[]>([]);
  const [audience, setAudience] = useState<Audience[]>(['DIRECTION']);
  const [sms, setSms] = useState(false);
  // Une modification après le compte oblige à recompter.
  const [counted, setCounted] = useState(false);
  const p = counted ? state.preview : undefined;
  const touch = () => setCounted(false);

  const targets: { key: Target; label: string }[] = [
    { key: 'ALL', label: `Toutes les écoles (${counts.ALL})` },
    { key: 'TRIALING', label: `Les écoles en essai (${counts.TRIALING})` },
    { key: 'PAID', label: `Les écoles abonnées (${counts.PAID})` },
    { key: 'EXPIRED', label: `Les écoles à l’abonnement expiré (${counts.EXPIRED})` },
    { key: 'SCHOOLS', label: 'Une ou plusieurs écoles au choix' },
  ];

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setCounted(true);
        const fd = new FormData(e.currentTarget);
        startTransition(() => formAction(fd));
      }}
      className="grid gap-5 lg:grid-cols-2"
    >
      <div className="space-y-3">
        <h2 className="text-lg font-extrabold">Le message</h2>
        <Field label="Titre" htmlFor="title" required>
          <Input id="title" name="title" maxLength={140} required value={title} onChange={(e) => (setTitle(e.target.value), touch())} />
        </Field>
        <Field label="Texte" htmlFor="body">
          <textarea
            id="body"
            name="body"
            maxLength={2000}
            rows={6}
            value={body}
            onChange={(e) => (setBody(e.target.value), touch())}
            className="w-full rounded-[--radius-card] border bg-[color:var(--surface)] px-3 py-2 text-sm"
          />
        </Field>
        <fieldset className="space-y-1 text-sm">
          <legend className="mb-1 text-sm font-medium">Importance</legend>
          <label className="flex items-center gap-2">
            <input type="radio" name="importance" value="INFO" checked={importance === 'INFO'} onChange={() => setImportance('INFO')} />
            Information <span className="text-[color:var(--muted-foreground)]">(dans la cloche)</span>
          </label>
          <label className="flex items-start gap-2">
            <input type="radio" name="importance" value="IMPORTANT" className="mt-1" checked={importance === 'IMPORTANT'} onChange={() => setImportance('IMPORTANT')} />
            <span>
              Important <span className="text-[color:var(--muted-foreground)]">(en plus, un bandeau orange reste affiché jusqu’à « J’ai compris »)</span>
            </span>
          </label>
        </fieldset>
        <Field label="Afficher le bandeau jusqu’au (facultatif)" htmlFor="showUntil">
          <Input id="showUntil" name="showUntil" type="date" value={showUntil} onChange={(e) => setShowUntil(e.target.value)} />
        </Field>
      </div>

      <div className="space-y-4">
        <fieldset className="space-y-1 text-sm">
          <legend className="mb-1 text-lg font-extrabold">Quelles écoles</legend>
          {targets.map((t) => (
            <label key={t.key} className="flex items-center gap-2">
              <input type="radio" name="target" value={t.key} checked={target === t.key} onChange={() => (setTarget(t.key), touch())} />
              {t.label}
            </label>
          ))}
          {target === 'SCHOOLS' ? (
            <div className="ml-6 mt-2 max-h-48 space-y-1 overflow-y-auto rounded-xl border p-2" style={{ borderColor: 'var(--border)' }}>
              {schools.map((s) => (
                <label key={s.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="schoolIds"
                    value={s.id}
                    checked={picked.includes(s.id)}
                    onChange={(e) => (setPicked(e.target.checked ? [...picked, s.id] : picked.filter((x) => x !== s.id)), touch())}
                  />
                  {s.name}
                </label>
              ))}
            </div>
          ) : null}
        </fieldset>

        <fieldset className="space-y-1 text-sm">
          <legend className="mb-1 text-lg font-extrabold">Qui dans l’école</legend>
          {(Object.keys(AUDIENCE_LABEL) as Audience[]).map((a) => (
            <label key={a} className="flex items-center gap-2">
              <input
                type="checkbox"
                name="audience"
                value={a}
                checked={audience.includes(a)}
                onChange={(e) => (setAudience(e.target.checked ? [...audience, a] : audience.filter((x) => x !== a)), touch())}
              />
              {AUDIENCE_LABEL[a]}
            </label>
          ))}
        </fieldset>

        <fieldset className="space-y-1 text-sm">
          <legend className="mb-1 text-lg font-extrabold">Comment</legend>
          <p>Dans l’application : la cloche{importance === 'IMPORTANT' ? ' et le bandeau' : ''}.</p>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="sms" checked={sms} onChange={(e) => (setSms(e.target.checked), touch())} />
            Aussi par SMS au fondateur de chaque école{' '}
            <span className="text-[color:var(--muted-foreground)]">({pricePerSms} F le SMS, payé par la plateforme)</span>
          </label>
        </fieldset>

        {state.error ? <Alert tone="error">{state.error}</Alert> : null}
        {p ? (
          <div className="space-y-3 rounded-2xl border p-4" style={{ borderColor: 'var(--border)' }}>
            <p className="text-sm">
              <b>{p.persons.toLocaleString('fr-FR')} personne{p.persons > 1 ? 's' : ''}</b> dans {p.schools} école{p.schools > 1 ? 's' : ''}
              {p.schoolNames.length > 0 ? (
                <span className="block text-[color:var(--muted-foreground)]">
                  {p.schoolNames.join(', ')}
                  {p.schools > p.schoolNames.length ? `, et ${p.schools - p.schoolNames.length} autre(s)` : ''}
                </span>
              ) : null}
              {sms ? (
                <>
                  {' '}
                  · <b>{p.sms} SMS</b> (environ {p.smsCost.toLocaleString('fr-FR')} F)
                  {p.sms < p.schools ? ` — ${p.schools - p.sms} école(s) sans numéro de fondateur` : ''}
                </>
              ) : null}
            </p>
            <input type="hidden" name="confirm" value="oui" />
            <input type="hidden" name="previewKey" value={p.key} />
            <div className="flex gap-2">
              <Button type="submit" disabled={pending}>
                {pending ? 'Envoi…' : 'Confirmer l’envoi'}
              </Button>
              <Button type="button" variant="ghost" onClick={touch}>
                Modifier
              </Button>
            </div>
          </div>
        ) : (
          <Button type="submit" variant="secondary" disabled={pending}>
            {pending ? 'Calcul…' : 'Voir combien de personnes'}
          </Button>
        )}
      </div>
    </form>
  );
}
