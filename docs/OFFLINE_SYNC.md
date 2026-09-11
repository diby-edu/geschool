# Fonctionnement hors connexion et synchronisation

Périmètre arbitré en ADR-009 : **l'appel** et **l'inscription**. Rien d'autre.

Le reste de l'application exige le réseau. C'est délibéré : rendre tout hors ligne
multiplierait les divergences de données sans bénéfice terrain, alors que ces deux écrans-là
sont ceux qu'on utilise en classe et au guichet, réseau absent.

---

## 1. Vue d'ensemble

```
Écran d'appel / d'inscription
        |
   écriture LOCALE d'abord, toujours          IndexedDB (Dexie)
        |
   state = LOCAL_SAVED                        visible par l'utilisateur
        |
   mise en file de sortie -> PENDING_SYNC
        |
   déclencheurs :  retour du réseau  |  clic « Synchroniser »  |  périodique
        v
   POST /api/sync/operations                  lot ordonné, rejouable
        |
   serveur : UNIQUE (school_id, client_operation_id)
        |     déjà appliquée ? renvoyer le résultat mémorisé
        v
   state = SYNCED   |   CONFLICT   |   REJECTED
```

L'écriture locale précède **toujours** la tentative réseau, même en ligne. C'est ce qui rend le
comportement identique avec et sans connexion, et donc testable.

---

## 2. Ce qui est mis en cache

Le service worker précharge, pour l'enseignant connecté et pour les 7 jours à venir :

| Donnée | Pourquoi |
|---|---|
| Ses `session_occurrences` | savoir quel cours il a et quand |
| Les élèves de ses classes et groupes | faire l'appel |
| Les appels déjà saisis | ne pas ressaisir |
| Le paramétrage de présence | statuts autorisés, seuil de retard |

Pour l'agent d'inscription : niveaux, classes, listes de référence, format du matricule.

Le cache est rafraîchi à chaque passage en ligne et expire au bout de 14 jours. Il ne contient
que les données du périmètre RBAC de l'utilisateur : le hors-ligne n'élargit jamais un accès.

---

## 3. Modèle local

```ts
// IndexedDB, base par (school_id, user_id) — jamais de mélange de tenants
type LocalOperation = {
  clientOperationId: string;      // UUID v4, généré sur l'appareil
  schoolId: string;
  type: 'attendance.submit' | 'attendance.update' | 'enrollment.create';
  payload: unknown;               // validé par le même schéma Zod que le serveur
  state: 'LOCAL_SAVED' | 'PENDING_SYNC' | 'SYNCING' | 'SYNCED' | 'CONFLICT' | 'REJECTED';
  createdAt: string;
  attempts: number;
  lastError?: { code: string; message: string };
  serverResult?: unknown;
};
```

Une déconnexion de l'utilisateur purge la base locale. Un changement d'établissement ouvre une
base distincte : deux tenants ne se touchent jamais, pas même dans le navigateur.

---

## 4. Idempotence

C'est la pièce maîtresse. Sans elle, une synchronisation rejouée crée des doublons — et la
synchronisation *sera* rejouée : réseau instable, onglet rechargé, utilisateur impatient.

**Règle.** Chaque opération porte un `client_operation_id` généré **au moment de la saisie**,
jamais au moment de l'envoi. Le serveur applique :

```sql
insert into sync_operations (school_id, user_id, client_operation_id, operation_type, payload, status)
values ($1, $2, $3, $4, $5, 'RECEIVED')
on conflict (school_id, client_operation_id) do nothing
returning id;
```

- **Ligne insérée** : opération neuve, elle est appliquée dans la transaction, puis
  `status = APPLIED` et `result` mémorisé.
- **Aucune ligne** : déjà vue. Le serveur relit `result` et le renvoie tel quel.
  **Il ne rejoue rien.** Le client passe en `SYNCED`.

Toute l'application de l'opération se fait dans la **même transaction** que la mise à jour de
`sync_operations`. Un plantage à mi-chemin ne laisse jamais une opération marquée appliquée
alors qu'elle ne l'est pas.

---

## 5. Endpoint de synchronisation

```
POST /api/sync/operations
{
  "schoolSlug": "lycee-moderne",
  "operations": [
    { "clientOperationId": "b3f1…", "type": "attendance.submit", "payload": { … } },
    { "clientOperationId": "c7a2…", "type": "enrollment.create",  "payload": { … } }
  ]
}
```

Réponse, une entrée par opération, dans l'ordre :

```jsonc
{
  "results": [
    { "clientOperationId": "b3f1…", "status": "APPLIED",  "result": { "registerId": "…" } },
    { "clientOperationId": "c7a2…", "status": "CONFLICT",
      "conflict": { "code": "STUDENT_ALREADY_ENROLLED",
                    "message": "Un élève portant ce matricule existe déjà.",
                    "serverState": { … } } }
  ]
}
```

Traitement **séquentiel** dans l'ordre reçu, une transaction par opération. Un échec n'annule
pas les précédentes et n'empêche pas les suivantes : chaque opération est indépendante.

Lot plafonné à 100 opérations ; au-delà, le client découpe. Toutes les barrières de sécurité de
`ARCHITECTURE.md` §4 s'appliquent à cet endpoint comme à n'importe quelle Server Action — le
hors-ligne n'est pas une porte dérobée.

---

## 6. Appel hors ligne

```
L'enseignant ouvre son cours du jour           depuis le cache
Il coche les statuts                           écriture locale immédiate
Il valide                                      LOCAL_SAVED -> PENDING_SYNC
        |
   réseau présent ?  oui -> envoi immédiat, SYNCED en une seconde
                     non -> bandeau : « 1 appel en attente de synchronisation »
        |
   retour du réseau ou clic « Synchroniser »
        v
   attendance_registers créé, client_operation_id conservé
   source = OFFLINE_SYNC
```

`attendance_registers` porte `UNIQUE (session_occurrence_id)` **et** le `client_operation_id` :
double barrière. Deux appareils qui feraient l'appel du même cours produiraient un conflit
explicite, pas un doublon silencieux.

**Conflit possible** : l'appel a déjà été saisi côté serveur, par un autre utilisateur ou depuis
un autre appareil. Le serveur répond `CONFLICT` avec l'état serveur, et l'interface propose :
conserver la version serveur, ou la remplacer par la version locale — avec la liste nominative
des écarts. Jamais d'écrasement automatique.

---

## 7. Inscription hors ligne

```
Saisie complète : élève + responsables       LOCAL_SAVED
        |
   « Enregistré localement.
     Les comptes seront créés à la synchronisation. »        ← jamais de fausse affirmation
        |
   PENDING_SYNC -> synchronisation
        v
   Serveur, transaction unique :
     1  élève + matricule définitif           attribué par le serveur, jamais par l'appareil
     2  inscription dans la classe
     3  responsables : rechercher ou créer sur (school_id, phone_e164)
     4  comptes Auth manquants
     5  relations parent-enfant
     6  account_access
     7  credential_deliveries en PENDING
        |
   SYNCED -> l'écran de confirmation affiche l'état réel des comptes
```

**Le matricule est attribué par le serveur**, à la synchronisation. Deux agents hors ligne ne
peuvent donc pas produire le même numéro. Localement, l'élève est identifié par un provisoire
`LOCAL-<uuid>` clairement marqué comme tel.

Cas particulier utile : deux agents inscrivent hors ligne deux enfants du **même père**. À la
synchronisation, le premier crée le compte parent, le second le retrouve par son téléphone
normalisé et s'y rattache. Un seul compte, deux enfants — sans coordination entre les appareils.

---

## 8. États montrés à l'utilisateur

L'interface ne ment jamais sur l'état réel (§77).

```
✓ Synchronisé                     tout est sur le serveur
⧗ 3 opérations en attente         enregistrées localement, pas encore envoyées
↻ Synchronisation en cours…       envoi en cours
⚠ 1 conflit à résoudre            arbitrage utilisateur nécessaire
✕ Hors ligne — dernière synchro : aujourd'hui 09:14
```

Le bouton **« Synchroniser »** est toujours visible et toujours actionnable, comme demandé.
Il n'est jamais l'unique moyen : la synchronisation automatique s'exécute au retour du réseau,
au premier plan de l'onglet, et toutes les 5 minutes tant qu'il reste des opérations en attente.

---

## 9. Ce que le hors-ligne ne fait pas

- Pas de création de compte Auth hors ligne : impossible sans le serveur, et prétendre le
  contraire serait une fausse promesse.
- Pas de génération de matricule définitif hors ligne.
- Pas d'envoi de SMS hors ligne.
- Pas de saisie de notes hors ligne en V1 : le calcul des moyennes et les règles de validation
  dépendent d'un état serveur qu'un appareil déconnecté ne peut pas arbitrer. À reconsidérer
  après retour du terrain.
- Pas de consultation hors ligne des bulletins ou de l'emploi du temps au-delà du cache de
  7 jours.

---

## 10. Tests

```
Idempotence
  même opération envoyée 10 fois            un seul enregistrement
  lot rejoué intégralement                  aucun doublon, résultats identiques
  coupure réseau en plein envoi             pas d'état « appliqué » erroné

Appel
  appel hors ligne puis synchronisation     registre créé, source OFFLINE_SYNC
  appel déjà saisi côté serveur             CONFLICT, arbitrage proposé
  deux appareils, même cours                un seul registre, un conflit signalé

Inscription
  inscription hors ligne                    élève, parents, comptes, SMS créés
  deux enfants, même père, deux appareils   un seul compte parent
  synchronisation rejouée                   aucun doublon
  matricule                                 attribué par le serveur, unique

Sécurité
  cache local                               limité au périmètre RBAC de l'utilisateur
  changement de tenant                      base locale distincte, aucun mélange
  déconnexion                               purge complète du stockage local
  endpoint de synchronisation               soumis aux quatre barrières, sans exception
```
