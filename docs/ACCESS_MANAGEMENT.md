# Gestion des accès — comptes, identifiants, transmission

Traduction technique de l'additif « comptes parents et élèves ». Les arbitrages sont
ADR-005 (identités) et ADR-006 (mot de passe temporaire).

---

## 1. Principes

1. **Chaque représentant légal a son propre compte.** Jamais de compte partagé entre le père et
   la mère : identifiants, sessions, mots de passe, historique et statut d'activation distincts.
2. **Un parent, un seul compte, plusieurs enfants.** Le deuxième enfant du même père réutilise
   le compte existant.
3. **Les comptes ne se créent pas à la main.** Ils naissent de l'inscription de l'élève.
4. **Aucun OTP.** Le SMS transmet des identifiants, il n'authentifie pas.
5. **Aucun secret n'est stocké**, sous aucune forme, à aucun moment.
6. **Le SMS n'est pas le canal de notification scolaire** (ADR-010).

---

## 2. Identifiants

| Profil | Identifiant saisi | Unicité | Identité Auth réelle |
|---|---|---|---|
| Parent | téléphone `+2250101010101` | `UNIQUE (school_id, phone_e164)` | `p.<uuid>@accounts.invalid` |
| Élève | matricule `ELV-2026-008742` | `UNIQUE (school_id, matricule)` | `s.<uuid>@accounts.invalid` |
| Personnel | email réel | `UNIQUE (school_id, email)` | son email |

### Normalisation du téléphone

Le stockage est **toujours** E.164. La saisie ne l'est jamais.

```
saisi      01 01 01 01 01
           0101010101
           +225 01 01 01 01 01
           00225 0101010101
canonique  +2250101010101      -> guardians.phone_e164, account_access.login_identifier
affiché    01 01 01 01 01      -> guardians.phone_display, format du pays de l'établissement
```

Le pays par défaut vient de `schools.country_code`. La normalisation est une fonction pure,
testée unitairement, partagée par le formulaire, l'import Excel et la synchronisation hors ligne
— une seule implémentation, sinon les doublons reviennent par la porte de derrière.

### Format du matricule

Modèle configurable dans `school_settings.access.matricule_format`, par défaut
`ELV-{YYYY}-{SEQ:6}`. La séquence est atomique par établissement et par année : une fonction SQL
`app.next_matricule(school_id, academic_year_id)` sous `SELECT … FOR UPDATE`, jamais un
`count(*) + 1`.

---

## 3. Orchestration de l'inscription

Une seule opération pour l'utilisateur, une seule transaction pour le serveur.

```
Formulaire d'inscription
  élève : identité, niveau, classe
  responsables : père (0101010101), mère (0202020202), lien, contact principal
        |
        v
enrollmentService.enroll()          transaction unique
        |
 1  créer l'élève                   matricule attribué
 2  créer student_enrollments        classe pour l'année en cours
 3  POUR CHAQUE responsable
      normaliser le téléphone
      chercher guardians (school_id, phone_e164)
        trouvé   -> réutiliser, mettre à jour les champs manquants
        absent   -> créer le responsable
      si pas de compte : créer l'utilisateur Auth + membership + rôle PARENT
      créer student_guardians (élève, responsable, lien)
 4  créer le compte élève            identifiant = matricule, rôle STUDENT
 5  créer account_access             pour chaque compte neuf
                                     must_change_password = true
                                     activation_status = NOT_ACTIVATED
 6  créer credential_deliveries      statut PENDING, sans aucun secret
 7  audit + access_events
        |
        v
 mode AUTOMATIQUE -> job credentials.deliver mis en file
 mode MANUEL      -> reste en PENDING, attend un clic
```

Le point 3 est le cœur de l'additif §4 : le « rechercher ou créer » sur
`(school_id, phone_e164)` garantit qu'un père de trois enfants n'a qu'un compte.

### Écran de confirmation (additif §16)

Immédiatement après validation, l'état réel des comptes, sans rien affirmer de faux :

```
ÉLÈVE   Jean KOUASSI   ELV-2026-008742

✓ Dossier créé
✓ Compte élève créé
✓ Compte père créé          (nouveau)
✓ Compte mère rattaché      (compte existant, déjà activé)

TRANSMISSION DES IDENTIFIANTS
Père   +225 01 01 01 01 01   SMS en attente      [Envoyer]
Mère   +225 02 02 02 02 02   Déjà activé         (aucun envoi nécessaire)
```

---

## 4. Cycle de vie du mot de passe temporaire (ADR-006)

Le secret n'existe qu'en mémoire, le temps d'un envoi.

```
CRÉATION DU COMPTE
  mot de passe aléatoire 32 octets, non transmis, non conservé
  must_change_password = true
  activation_status    = NOT_ACTIVATED
  credential_deliveries -> PENDING     (aucun secret dans la ligne)

TRAITEMENT DE L'ENVOI     worker credentials.deliver
  1  verrouiller la ligne, passer en PROCESSING
  2  générer le secret temporaire en mémoire       6 caractères, alphabet sans ambiguïté
                                                    (ni 0/O, ni 1/I/l)
  3  Admin API Supabase : définir ce mot de passe
  4  rendre le message à partir du gabarit
  5  SmsService.send()
  6  statut SENT, provider_message_id enregistré
  7  le secret sort de la portée, aucune trace
  8  access_events : CREDENTIALS_SENT
```

Ni la base, ni les journaux, ni `audit_logs`, ni les analytics ne voient jamais ce secret.
Un renvoi n'exhume pas l'ancien : il en génère un neuf.

### Gabarit du SMS

```
[LYCÉE MODERNE] Votre espace parent est disponible.
Identifiant : 0101010101
Mot de passe temporaire : X7K4P9
Connexion : https://app.exemple.com/e/lycee-moderne
Vous devrez choisir votre mot de passe personnel à la première connexion.
```

Gabarit modifiable par établissement, longueur contrôlée pour tenir en un seul SMS.

---

## 5. Première connexion

```
Parent saisit  0101010101  +  X7K4P9
        |
serveur : normaliser -> +2250101010101
          résoudre (school_id, phone) -> account_access -> auth_email
          signInWithPassword(auth_email, mot de passe)
        |
must_change_password = true ?
        |
        OUI -> redirection FORCÉE vers /first-login
               le tableau de bord est inatteignable, y compris par URL directe
               y compris pour les Route Handlers d'API
        |
« Pour sécuriser votre compte, définissez votre mot de passe personnel. »
  Nouveau mot de passe  /  Confirmation
        |
Validation
  1  politique de mot de passe vérifiée côté serveur
  2  Auth : nouveau secret ; l'ancien devient invalide de ce fait
  3  must_change_password = false
  4  activation_status = ACTIVATED, activated_at = now()
  5  account_status = ACTIVE
  6  access_events : ACCOUNT_ACTIVATED
  7  audit_logs
  8  redirection vers l'espace du rôle
```

Le parcours élève est identique, avec le matricule pour identifiant.

---

## 6. File d'envoi

### États (additif §24 — trois dimensions séparées)

```
COMPTE        CREATED -> ACTIVE -> SUSPENDED -> DISABLED
ACTIVATION    NOT_ACTIVATED -> ACTIVATED
ENVOI         PENDING -> PROCESSING -> SENT -> DELIVERED
                                    -> FAILED -> (retry) -> PENDING
                                    -> CANCELLED
```

Jamais fusionnées : un compte peut être `ACTIVE` avec un envoi `FAILED`, ou `NOT_ACTIVATED`
avec un envoi `DELIVERED`.

### Réessais

`max_attempts = 5`, repli exponentiel `next_attempt_at = now() + 2^attempts minutes`, plafonné
à 6 heures. Au-delà, `FAILED` définitif et remontée dans le tableau de bord des accès.

Les erreurs du fournisseur sont classées : **définitives** (numéro invalide, non attribué —
aucun réessai) et **transitoires** (quota, indisponibilité — réessai).

### Envoi groupé (additif §18)

```
POST /api/access/deliveries/bulk    { filter: {...}, reason: 'INITIAL' }
  -> crée credential_delivery_batches
  -> crée N lignes credential_deliveries en PENDING
  -> met en file N jobs, plafonnés en débit
  -> répond immédiatement avec batch_id
```

Jamais 500 appels SMS dans une requête HTTP. L'interface suit l'avancement du lot en
interrogeant `batch_id`, sans bloquer le navigateur.

Un débit maximal par établissement (`school_settings.access.sms_rate_per_minute`) protège du
dépassement de quota fournisseur.

### Idempotence

`UNIQUE (school_id, idempotency_key)` sur `credential_deliveries`. La clé est déterministe :
`sha256(user_id + reason + jour)`. Deux clics, un double envoi de formulaire, ou une
synchronisation hors ligne rejouée ne produisent qu'un seul SMS (additif §22).

---

## 7. Abstraction SMS

```
Application  ->  SmsService  ->  SmsProvider (interface)  ->  passerelle
```

```ts
export interface SmsProvider {
  readonly name: string;
  send(msg: { to: string; body: string; reference: string }): Promise<SmsSendResult>;
  getStatus?(providerMessageId: string): Promise<SmsDeliveryStatus>;
  handleWebhook?(payload: unknown): SmsDeliveryUpdate | null;
}
```

Adaptateurs : `ConsoleProvider` (développement, écrit dans le journal), puis le fournisseur
retenu (Q1 de `DECISIONS.md`). Le choix se fait par variable d'environnement, sans toucher au
métier. Les accusés de réception, quand le fournisseur en propose, arrivent par webhook et font
passer `SENT` à `DELIVERED`.

---

## 8. Module « Gestion des accès »

Route `/e/{slug}/access`. Ce n'est **pas** un écran de création d'élèves ou de parents : il gère
le cycle de vie des accès (additif §14).

### Indicateurs, cliquables pour filtrer

```
Comptes élèves    1 250      Comptes parents   1 870
Activés           2 650      Non activés         470
SMS en attente       23      SMS envoyés       2 620      SMS en échec        7
```

### Filtres (additif §31)

Type (élève / parent), classe, niveau, statut de compte, activation, statut d'envoi, période,
recherche par nom, par matricule, par téléphone.

### Actions, chacune adossée à une permission

| Action | Permission |
|---|---|
| Consulter la liste et les indicateurs | `access_accounts.view` |
| Envoyer les identifiants | `access_accounts.send` |
| Renvoyer | `access_accounts.resend` |
| Envoi groupé | `access_accounts.bulk_send` |
| Réinitialiser le mot de passe | `access_accounts.reset` |
| Désactiver | `access_accounts.disable` |
| Réactiver | `access_accounts.reactivate` |
| Consulter l'historique | `access_accounts.view_history` |

Le directeur les possède toutes. Un éducateur ne reçoit **que** ce que l'établissement lui
attribue (additif §15) : typiquement `view`, `send`, `resend`, sans `reset` ni `disable`.

### Modes d'envoi (additif §17)

`school_settings.access.delivery_mode` : `AUTOMATIC` (mise en file dès la création) ou `MANUAL`
(reste `PENDING` jusqu'au clic). Les deux sont pleinement supportés.

---

## 9. Réinitialisation

```
[Réinitialiser le mot de passe]  ->  confirmation explicite
  1  générer un secret temporaire en mémoire
  2  Admin API : le définir (l'ancien cesse d'être valide)
  3  must_change_password = true
  4  activation_status inchangé
  5  last_reset_at, reset_count + 1
  6  credential_deliveries : reason = RESET
  7  envoi au numéro enregistré du compte, jamais à un numéro saisi à la volée
  8  access_events : PASSWORD_RESET  +  audit_logs
```

Le point 7 est une protection : réinitialiser vers un numéro fourni dans le formulaire
permettrait de détourner un compte parent.

**Limitation d'abus** (additif §25) : 3 réinitialisations par compte et par 24 h, 50 par
établissement et par heure. Au-delà, refus explicite et alerte à l'administrateur.

---

## 10. Changement de numéro

Le téléphone étant l'identifiant, c'est une opération sensible (additif §26).

```
1  normaliser le nouveau numéro
2  vérifier UNIQUE (school_id, phone_e164) — refus si déjà pris
3  mettre à jour guardians.phone_e164 ET account_access.login_identifier
   dans la même transaction
4  invalider les sessions actives du compte
5  access_events : PHONE_CHANGED (ancien et nouveau numéro)
6  audit_logs
```

**Jamais** de nouveau compte parce que le numéro change. Le compte, ses enfants et son
historique sont conservés.

---

## 11. Sortie d'un élève

```
Père
├── Jean   — sorti
└── Marie  — active
```

Le compte du père **reste actif** : il est encore lié à Marie. Le compte de Jean est désactivé
ou archivé selon `school_settings.access.on_student_exit`.

Règle appliquée : un compte parent n'est désactivé que si **aucune** de ses relations
`student_guardians` ne pointe encore vers un élève actif (additif §27). Contrôle exécuté à
chaque sortie, et une fois par jour par le job `maintenance.daily` pour rattraper les cas de
sortie en masse.

---

## 12. Historique par compte (additif §23)

```
Compte créé                     10/09/2026 09:14   par F. Traoré
Identifiants envoyés (SMS)      10/09/2026 09:15   +225 01 01 01 01 01
SMS délivré                     10/09/2026 09:15
Compte activé                   11/09/2026 07:42
Mot de passe modifié            11/09/2026 07:42
Mot de passe réinitialisé       20/10/2026 11:03   par le Directeur
Identifiants renvoyés (SMS)     20/10/2026 11:03
```

Aucun mot de passe, présent ou passé, n'apparaît jamais.

---

## 13. Inscription hors ligne

Voir [`OFFLINE_SYNC.md`](./OFFLINE_SYNC.md). Points spécifiques aux accès :

- hors ligne, **aucun compte serveur n'existe** et l'interface ne prétend pas le contraire ;
  elle affiche `Enregistré localement — comptes en attente de synchronisation` ;
- l'appareil génère un `client_operation_id` ; le serveur déduplique dessus ;
- rejouer dix fois la même synchronisation crée un élève, deux parents, deux comptes et deux
  SMS — pas vingt (additif §29) ;
- une fois synchronisé, l'écran de confirmation de la section 3 s'affiche avec l'état réel.

---

## 14. Tests obligatoires (additif §36)

```
Parent
  création automatique à l'inscription
  deux représentants -> deux comptes distincts
  un parent, plusieurs enfants -> un seul compte
  deuxième enfant -> réutilisation du compte existant, aucun doublon
  première connexion -> changement de mot de passe imposé
  réinitialisation -> ancien secret invalide, compte de l'autre parent intact
  changement de numéro -> même compte, sessions invalidées
  sortie d'un enfant sur deux -> compte conservé

Élève
  création, unicité du matricule dans l'établissement
  première connexion, changement imposé
  accès limité à ses seules données

SMS
  création de tâche, envoi, DELIVERED, FAILED, retry
  idempotence : double clic = un seul envoi
  envoi groupé asynchrone, sans blocage
  secret absent de la base, des journaux et de l'audit

Multi-tenant
  parent école A -> aucune donnée école B
  éducateur école A -> ne gère pas les comptes de B
  même numéro dans deux écoles -> deux comptes indépendants, aucune collision

Hors ligne
  inscription hors ligne -> synchronisation -> comptes et SMS créés
  synchronisation rejouée -> aucun doublon
```
