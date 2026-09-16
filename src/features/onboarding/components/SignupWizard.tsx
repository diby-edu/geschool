'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { registerSchoolAction } from '../actions';
import type { FormState } from '@/lib/forms';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';

const STEP_LABELS = ['Établissement', 'Modules', 'Votre compte'];

const EDUCATION_TRACKS = [
  { code: 'GENERAL', name: 'GÉNÉRAL', desc: '6ème à Terminale (séries A, C, D)' },
  { code: 'TECHNIQUE', name: 'TECHNIQUE', desc: 'Séries B, F, G, T' },
  { code: 'PROFESSIONNEL', name: 'PROFESSIONNEL', desc: 'BEP, BT, CAP, CQP, FQ' },
] as const;

const MODULES = [
  {
    code: 'SCOL',
    icon: '📘',
    name: 'Gestion scolaire et notes',
    desc: 'Élèves, enseignants, classes, salles, emploi du temps, notes et bulletins réunis au même endroit.',
    price: 200000,
    benefits: [
      'Bulletins prêts à imprimer, sans ressaisie',
      'Emploi du temps généré pour chaque classe',
      'Moyennes et classements calculés automatiquement',
    ],
  },
  {
    code: 'APPEL',
    icon: '✋',
    name: 'Appel numérique',
    desc: 'Les enseignants marquent la présence en quelques secondes, sans papier, depuis leur téléphone.',
    price: 100000,
    benefits: [
      'Appel pris en quelques secondes depuis le téléphone',
      'Historique de présence consultable par la direction',
    ],
  },
] as const;

const PARENT_BENEFIT = 'Familles informées en direct, sans appel ni message à rédiger';

function fmt(n: number): string {
  return `${n.toLocaleString('fr-FR')} F`;
}

function toggleInSet(set: Set<string>, code: string): Set<string> {
  const next = new Set(set);
  if (next.has(code)) next.delete(code);
  else next.add(code);
  return next;
}

type Fields = {
  name: string;
  city: string;
  neighborhood: string;
  registrationNumber: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  password: string;
  confirmPassword: string;
};

const EMPTY_FIELDS: Fields = {
  name: '', city: '', neighborhood: '', registrationNumber: '',
  firstName: '', lastName: '', phone: '', email: '', password: '', confirmPassword: '',
};

function WizardSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="mkt-pill" disabled={pending} aria-busy={pending}>
      {pending ? 'Un instant…' : 'Démarrer mon essai gratuit →'}
    </button>
  );
}

export function SignupWizard() {
  const [state, formAction] = useActionState<FormState, FormData>(registerSchoolAction, {});
  const err = state.fieldErrors ?? {};

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [fields, setFields] = useState<Fields>({ ...EMPTY_FIELDS, ...state.values });
  const [logoName, setLogoName] = useState<string | null>(null);
  const [autoCode, setAutoCode] = useState(false);
  const [tracks, setTracks] = useState<Set<string>>(new Set(['GENERAL']));
  const [modules, setModules] = useState<Set<string>>(new Set(['SCOL']));
  const [parentEnabled, setParentEnabled] = useState(false);

  function setField(name: keyof Fields, value: string) {
    setFields((f) => ({ ...f, [name]: value }));
  }

  const canParent = modules.size > 0;
  const total = MODULES.filter((m) => modules.has(m.code)).reduce((s, m) => s + m.price, 0);
  const benefits: string[] = MODULES.filter((m) => modules.has(m.code)).flatMap((m) => m.benefits);
  if (canParent && parentEnabled) benefits.push(PARENT_BENEFIT);

  const step1Valid =
    fields.name.trim() !== '' &&
    fields.city.trim() !== '' &&
    fields.neighborhood.trim() !== '' &&
    (autoCode || fields.registrationNumber.trim() !== '') &&
    tracks.size > 0;
  const step2Valid = modules.size > 0;

  return (
    <div className="mkt-wiz-shell">
      <div className="mkt-wiz-stepper">
        {STEP_LABELS.map((label, i) => {
          const n = i + 1;
          const st = n < step ? 'done' : n === step ? 'active' : '';
          return (
            <span key={label} style={{ display: 'flex', alignItems: 'center' }}>
              <span className={`mkt-wiz-pip ${st}`}>
                <span className="dot">{n < step ? '✓' : n}</span>
                <span className="label">{label}</span>
              </span>
              {n < STEP_LABELS.length ? <span className={`mkt-wiz-line ${n < step ? 'done' : ''}`} /> : null}
            </span>
          );
        })}
      </div>

      {state.error ? (
        <div className="mkt-wiz-panel" style={{ marginBottom: 16, borderColor: '#d1476b', color: '#d1476b' }}>
          {state.error}
        </div>
      ) : null}

      <form action={formAction}>
        {/* ---------------- Étape 1 — Établissement ---------------- */}
        <section className="mkt-wiz-panel" style={{ display: step === 1 ? undefined : 'none' }}>
          <span className="mkt-wiz-eyebrow">1 · Votre établissement</span>
          <h1 className="mkt-display">Présentez votre établissement</h1>
          <p className="sub">Ces informations seront visibles par vos enseignants, élèves et parents.</p>

          <div className="mkt-wiz-photo-row">
            <label className="mkt-wiz-photo-drop" style={{ cursor: 'pointer' }}>
              {logoName ? '✓' : '🏫'}
              <input
                type="file"
                name="logo"
                accept="image/jpeg,image/png,image/webp"
                style={{ display: 'none' }}
                onChange={(e) => setLogoName(e.target.files?.[0]?.name ?? null)}
              />
            </label>
            <div className="txt">
              Logo ou photo de l&apos;établissement
              <br />
              {logoName ?? '(optionnel, modifiable plus tard)'}
            </div>
          </div>

          <label className="mkt-wiz-field">
            <span className="lbl">
              Nom complet de l&apos;établissement <span className="req">*</span>
            </span>
            <input
              type="text"
              name="name"
              placeholder="Ex. Groupe Scolaire Les Cocotiers"
              value={fields.name}
              onChange={(e) => setField('name', e.target.value)}
              required
            />
            {err.name ? <p className="mkt-wiz-hint" style={{ color: '#d1476b' }}>{err.name[0]}</p> : null}
          </label>

          <div className="mkt-wiz-grid2">
            <label className="mkt-wiz-field">
              <span className="lbl">
                Ville <span className="req">*</span>
              </span>
              <input type="text" name="city" placeholder="Ex. Abidjan" value={fields.city} onChange={(e) => setField('city', e.target.value)} required />
            </label>
            <label className="mkt-wiz-field">
              <span className="lbl">
                Quartier <span className="req">*</span>
              </span>
              <input
                type="text"
                name="neighborhood"
                placeholder="Ex. Yopougon"
                value={fields.neighborhood}
                onChange={(e) => setField('neighborhood', e.target.value)}
                required
              />
            </label>
          </div>

          <label className="mkt-wiz-field">
            <span className="lbl">Code officiel de l&apos;école</span>
            <input
              type="text"
              name="registrationNumber"
              placeholder="Ex. 000206"
              value={fields.registrationNumber}
              onChange={(e) => setField('registrationNumber', e.target.value)}
              disabled={autoCode}
            />
            <p className="mkt-wiz-hint">
              Ce code vous a été délivré par le Ministère. Pas encore reçu le vôtre ? Cochez la case juste en dessous.
            </p>
            <div className="mkt-wiz-check-row">
              <Checkbox
                name="autoGenerateCode"
                checked={autoCode}
                onChange={(e) => setAutoCode(e.target.checked)}
                style={{ marginTop: 3 }}
              />
              <div>
                <div className="t">Attribuez-moi un code établissement provisoire</div>
                <div className="d">
                  Il permet d&apos;activer dès maintenant les comptes de votre équipe. Échangez-le contre le vrai code du
                  Ministère dès que vous l&apos;obtenez, depuis Paramètres → Identité.
                </div>
                {autoCode ? <div className="mkt-wiz-code-generated">Généré à la création</div> : null}
              </div>
            </div>
            {err.registrationNumber ? <p className="mkt-wiz-hint" style={{ color: '#d1476b' }}>{err.registrationNumber[0]}</p> : null}
          </label>

          <label className="mkt-wiz-field" style={{ marginTop: 8 }}>
            <span className="lbl">
              Ordres d&apos;enseignement proposés <span className="req">*</span>
            </span>
            <p className="mkt-wiz-hint" style={{ marginBottom: 12 }}>
              Cochez ce qui existe chez vous aujourd&apos;hui — un ajustement reste toujours possible.
            </p>
            <div className="mkt-wiz-order-grid">
              {EDUCATION_TRACKS.map((t) => (
                <div
                  key={t.code}
                  className={`mkt-wiz-order-card ${tracks.has(t.code) ? 'on' : ''}`}
                  onClick={() => setTracks((s) => toggleInSet(s, t.code))}
                >
                  <div>
                    <div className="oname">{t.name}</div>
                    <div className="odesc">{t.desc}</div>
                  </div>
                  <div className="radio" />
                  {tracks.has(t.code) ? <input type="hidden" name="educationTracks" value={t.code} /> : null}
                </div>
              ))}
            </div>
          </label>

          <div className="mkt-wiz-nav-row">
            <span />
            <button type="button" className="mkt-pill" disabled={!step1Valid} onClick={() => setStep(2)}>
              Continuer →
            </button>
          </div>
        </section>

        {/* ---------------- Étape 2 — Modules ---------------- */}
        <section className="mkt-wiz-panel" style={{ display: step === 2 ? undefined : 'none' }}>
          <span className="mkt-wiz-eyebrow">2 · Vos modules</span>
          <h1 className="mkt-display">Composez votre formule</h1>
          <p className="sub">
            Activez au moins un module pour démarrer — vous pourrez en ajouter ou en retirer depuis votre espace admin
            quand vous voulez.
          </p>

          <div className="mkt-wiz-step2-grid">
            <div>
              {MODULES.map((m) => (
                <div
                  key={m.code}
                  className={`mkt-wiz-module-card ${modules.has(m.code) ? 'on' : ''}`}
                  onClick={() => setModules((s) => toggleInSet(s, m.code))}
                >
                  <div className="icon">{m.icon}</div>
                  <div className="mbody">
                    <div className="mname">{m.name}</div>
                    <div className="mdesc">{m.desc}</div>
                    <div className="mprice">{fmt(m.price)} / an</div>
                  </div>
                  <div className="check">✓</div>
                  {modules.has(m.code) ? <input type="hidden" name="modules" value={m.code} /> : null}
                </div>
              ))}

              <div className={`mkt-wiz-parent-panel ${canParent ? '' : 'locked'}`}>
                <div className="icon">👨‍👩‍👧</div>
                <div className="mbody">
                  <div className="ptitle">
                    Espace Parent <span className="mkt-wiz-badge-free">Inclus, 0 F pour vous</span>
                  </div>
                  <div className="pdesc">
                    Chaque famille suit les notes et la présence de son enfant pour <b>2 000 F/an</b>, réglés directement
                    par elle en Mobile Money — aucun coût pour votre établissement. Vous gardez la main : activable et
                    désactivable à volonté.
                  </div>
                  {!canParent ? (
                    <div className="plockmsg">Activez d&apos;abord un module ci-contre pour ouvrir l&apos;Espace Parent.</div>
                  ) : null}
                </div>
                <Switch
                  name="parentPortalEnabled"
                  checked={canParent && parentEnabled}
                  disabled={!canParent}
                  onChange={(e) => setParentEnabled(e.target.checked)}
                />
              </div>
            </div>

            <aside className="mkt-wiz-summary">
              <span className="mkt-wiz-trial-badge">🎁 30 jours gratuits sur tous les modules choisis</span>
              <h3 className="mkt-display">Ce que vous activez</h3>
              <ul className="mkt-wiz-benefits">
                {benefits.length === 0 ? (
                  <li className="empty">Cochez un module pour voir ce qu&apos;il débloque.</li>
                ) : (
                  benefits.map((b) => (
                    <li key={b}>
                      <span className="tick">✓</span>
                      {b}
                    </li>
                  ))
                )}
              </ul>
              <h4 className="mkt-wiz-summary-sub">Récapitulatif</h4>
              {modules.size === 0 ? (
                <div className="mkt-wiz-sline empty">Aucun module sélectionné</div>
              ) : (
                MODULES.filter((m) => modules.has(m.code)).map((m) => (
                  <div key={m.code} className="mkt-wiz-sline">
                    <span>{m.name}</span>
                    <span className="sprice">{fmt(m.price)}</span>
                  </div>
                ))
              )}
              {canParent && parentEnabled ? (
                <div className="mkt-wiz-sline free">
                  <span>Espace Parent (payé par les familles)</span>
                  <span className="sprice">0 F</span>
                </div>
              ) : null}
              <div className="mkt-wiz-stotal">
                <span className="tl">Total / an</span>
                <span className="tv">{fmt(total)}</span>
              </div>
              <p className="mkt-wiz-trial-note">
                Aucun prélèvement avant le 31ᵉ jour : testez chaque module choisi en conditions réelles, sans
                engagement ni carte bancaire.
              </p>
            </aside>
          </div>

          <div className="mkt-wiz-nav-row">
            <button type="button" className="mkt-ghost" onClick={() => setStep(1)}>
              ← Retour
            </button>
            <button type="button" className="mkt-pill" disabled={!step2Valid} onClick={() => setStep(3)}>
              Continuer →
            </button>
          </div>
        </section>

        {/* ---------------- Étape 3 — Compte administrateur ---------------- */}
        <section className="mkt-wiz-panel" style={{ display: step === 3 ? undefined : 'none' }}>
          <span className="mkt-wiz-eyebrow">3 · Votre accès administrateur</span>
          <h1 className="mkt-display">Créez votre compte</h1>
          <p className="sub">
            C&apos;est vous qui administrerez l&apos;établissement au départ — vous pourrez inviter votre équipe dès
            votre première connexion.
          </p>

          <div className="mkt-wiz-grid2">
            <label className="mkt-wiz-field">
              <span className="lbl">
                Nom <span className="req">*</span>
              </span>
              <input type="text" name="lastName" value={fields.lastName} onChange={(e) => setField('lastName', e.target.value)} required />
              {err.lastName ? <p className="mkt-wiz-hint" style={{ color: '#d1476b' }}>{err.lastName[0]}</p> : null}
            </label>
            <label className="mkt-wiz-field">
              <span className="lbl">
                Prénom <span className="req">*</span>
              </span>
              <input type="text" name="firstName" value={fields.firstName} onChange={(e) => setField('firstName', e.target.value)} required />
              {err.firstName ? <p className="mkt-wiz-hint" style={{ color: '#d1476b' }}>{err.firstName[0]}</p> : null}
            </label>
          </div>

          <label className="mkt-wiz-field">
            <span className="lbl">
              Téléphone <span className="req">*</span>
            </span>
            <input type="tel" name="phone" placeholder="Ex. 07 00 00 00 00" value={fields.phone} onChange={(e) => setField('phone', e.target.value)} required />
            <p className="mkt-wiz-hint">Sert à vous envoyer un code de vérification et aux paiements Mobile Money.</p>
            {err.phone ? <p className="mkt-wiz-hint" style={{ color: '#d1476b' }}>{err.phone[0]}</p> : null}
          </label>

          <label className="mkt-wiz-field">
            <span className="lbl">
              Email <span className="req">*</span>
            </span>
            <input type="email" name="email" placeholder="vous@etablissement.com" value={fields.email} onChange={(e) => setField('email', e.target.value)} required />
            <p className="mkt-wiz-hint">Le lien pour activer votre compte arrivera à cette adresse.</p>
            {err.email ? <p className="mkt-wiz-hint" style={{ color: '#d1476b' }}>{err.email[0]}</p> : null}
          </label>

          <div className="mkt-wiz-grid2">
            <label className="mkt-wiz-field">
              <span className="lbl">
                Mot de passe <span className="req">*</span>
              </span>
              <input
                type="password"
                name="password"
                value={fields.password}
                onChange={(e) => setField('password', e.target.value)}
                required
              />
              {err.password ? <p className="mkt-wiz-hint" style={{ color: '#d1476b' }}>{err.password[0]}</p> : null}
            </label>
            <label className="mkt-wiz-field">
              <span className="lbl">
                Confirmer <span className="req">*</span>
              </span>
              <input
                type="password"
                name="confirmPassword"
                value={fields.confirmPassword}
                onChange={(e) => setField('confirmPassword', e.target.value)}
                required
              />
              {err.confirmPassword ? <p className="mkt-wiz-hint" style={{ color: '#d1476b' }}>{err.confirmPassword[0]}</p> : null}
            </label>
          </div>

          <div className="mkt-wiz-final-cta">
            🎁 30 jours offerts sur tous les modules activés — vous ne payez rien avant le 31ᵉ jour.
          </div>

          <div className="mkt-wiz-nav-row">
            <button type="button" className="mkt-ghost" onClick={() => setStep(2)}>
              ← Retour
            </button>
            <WizardSubmitButton />
          </div>
        </section>
      </form>
    </div>
  );
}
