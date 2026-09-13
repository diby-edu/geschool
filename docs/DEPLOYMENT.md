# Déploiement sur le VPS mutualisé

Audit réalisé le **10/09/2026** en lecture seule. Aucune modification n'a été apportée au
serveur.

> Les valeurs identifiantes — adresse du VPS, compte d'accès, inventaire nominatif des
> services voisins, référence du projet Supabase — vivent dans **`docs/DEPLOYMENT.local.md`**,
> qui n'est pas versionné. Le dépôt étant public, les réunir ici équivaudrait à publier une
> carte d'attaque. Ce document-ci conserve le raisonnement, les contraintes et la procédure.

---

## 1. État du VPS

### Système

| Élément | Valeur | Commentaire |
|---|---|---|
| OS | Ubuntu 22.04.5 LTS | |
| Noyau | 5.15.0-190 | |
| **vCPU** | **1** | **contrainte structurante — voir §2** |
| RAM | 3,8 Go — 1,0 Go utilisé, **2,5 Go disponibles** | |
| Swap | 4 Go (216 Mo utilisés) | filet de sécurité présent |
| Disque | 49 Go — 18 Go utilisés, **31 Go libres** | confortable |
| Charge | 0,22 / 0,52 / 0,36 | serveur au repos, sain |
| Uptime | 13 jours | |

### Ce qui tourne déjà

**10 applications PM2** en production, environ 920 Mo de mémoire au total, occupant les ports
**3000-3007, 3100 et 9101**. Inventaire nominatif dans `DEPLOYMENT.local.md`.

C'est cette occupation qui dicte le choix des ports de geschool (§3), et le fait que dix
services de production partagent l'unique vCPU qui dicte tout le §2.

### Réseau et sécurité

- **nginx** — 8 sites actifs, chacun avec son bloc `server_name`. Le partage des ports 80 et
  443 ne pose aucun problème ; seul le port interne doit être unique.
- **UFW actif** — 22, 80, 443 ouverts ; les ports applicatifs (3000-3007, 9101) sont
  explicitement bloqués depuis l'extérieur. Bonne hygiène déjà en place.
- **certbot** présent, avec des certificats déjà émis pour les autres sous-domaines.

### Runtimes disponibles

| Runtime | Verdict |
|---|---|
| Node système (v20) | suffisant pour Next 16, mais **partagé** — ne pas y toucher |
| Node nvm (v22) | **celui de geschool**, référencé par chemin explicite dans PM2 |
| **Docker** | **présent** — le solveur ira en conteneur |
| Python système (3.10, sans `pip`) | inutilisable tel quel → Docker règle le problème |
| nginx, certbot, git | présents |

Versions exactes dans `DEPLOYMENT.local.md`.

---

## 2. La contrainte à traiter en priorité : 1 seul vCPU

C'est le résultat le plus important de l'audit.

Le moteur d'emploi du temps est un solveur de contraintes : il **sature un cœur pendant
30 à 300 secondes**. Sur cette machine, ce cœur est le seul, et il fait déjà tourner
10 applications de production, dont des services de messagerie qui doivent répondre vite.

Sans précaution, lancer une génération d'emploi du temps rendrait **tous les autres sites
lents ou injoignables** pendant la durée du calcul. Le symptôme serait diffus et difficile à
relier à sa cause.

### Mesures retenues, applicables dès maintenant

| Mesure | Mise en œuvre |
|---|---|
| Brider le CPU du solveur | Conteneur Docker `--cpus=0.5`, `--memory=1g`, `--cpu-shares=512` |
| Priorité basse | `Nice=10` sur l'unité systemd du conteneur |
| Un seul calcul à la fois | `SOLVER_MAX_CONCURRENT_JOBS=1`, file pg-boss en singleton global |
| Solveur mono-thread | `num_search_workers=1` dans CP-SAT |
| Plafond de temps par défaut | 120 s, jamais illimité |
| PDF en série | `PDF_MAX_CONCURRENCY=1`, génération des bulletins en tâche de fond |
| Redémarrage sur fuite | `max_memory_restart: "400M"` sur l'app PM2 |

Avec ces garde-fous, une génération prend plus longtemps mais **les autres sites restent
servis**. C'est le bon compromis pour la phase de développement et pour une première école
pilote.

### Décision : on reste sur cette configuration (ADR-014)

Pas d'upgrade. Le projet est conçu **pour** cette machine, et non malgré elle. Deux mesures
supplémentaires en découlent, au-delà du tableau ci-dessus.

**Le build ne tourne pas sur le VPS.** `next build` sature l'unique cœur pendant plusieurs
minutes ; c'est le pic le plus violent de tout le cycle de vie, et il est parfaitement évitable.
La CI compile, le déploiement ne fait que transférer l'artefact `standalone` et redémarrer PM2 :

```
GitHub Actions          pnpm install + pnpm build
        |               artefact .next/standalone + static + public
        v
   rsync vers le VPS    /var/www/geschool/release-<sha>/
        |
   bascule du lien symbolique  current -> release-<sha>
        |
   pm2 reload           redémarrage sans interruption
```

Bénéfice annexe : le retour arrière consiste à repointer le lien vers la version précédente.

**Report des générations sous charge.** Avant de démarrer une génération, le worker lit
`/proc/loadavg`. Si la charge à 1 minute dépasse `SOLVER_MAX_LOAD_AVERAGE` (défaut `1.2`), le
job est différé de quelques minutes plutôt que lancé. Les huit sites en production passent
avant le confort d'une génération d'emploi du temps.

**Seuil de réévaluation**, à surveiller sans agir avant : charge à 1 minute durablement
au-dessus de 1,5, ou une génération `LARGE` dépassant 5 minutes. Les mesures du lot 7
donneront le chiffre réel. Le jour venu, l'architecture permet sans aucune modification de
code soit d'upgrader la machine, soit de déporter `solver-service` ailleurs : c'est déjà un
service distant derrière une interface (ADR-008).

---

## 3. Ressources réservées à ce projet

### Ports — libres et vérifiés

| Service | Port | Écoute |
|---|---|---|
| Application Next.js | **3110** | `127.0.0.1` uniquement |
| Service solveur (Docker) | **8110** | `127.0.0.1` uniquement |
| Worker PM2 | aucun | pas de port |

3110 et 8110 sont hors de toutes les plages occupées (3000-3007, 3100, 9101) et hors des
plages bloquées par UFW. Les deux services n'étant joignables que depuis `127.0.0.1`, seul
nginx peut les atteindre : aucune règle UFW supplémentaire n'est nécessaire.

### Emplacements

```
/var/www/geschool/           code de l'application (git clone)
  ├─ .env.local                      secrets, jamais commité
  ├─ ecosystem.config.cjs            PM2 : app web + worker
  └─ solver-service/                 image Docker du solveur
/etc/nginx/sites-available/geschool
/etc/letsencrypt/live/geschool.numerik360.com/
```

### Sous-domaine

Convention maison respectée — un sous-domaine par projet :

**`geschool.numerik360.com`** — créé le 10/09/2026.

Le certificat TLS reste à émettre (`certbot --nginx -d geschool.numerik360.com`), au moment
du premier déploiement.

Prévoir éventuellement `geschool-test.numerik360.com` pour la recette, sur le modèle de
ce qui se pratique déjà pour un autre projet du serveur.

### Dépôt

`https://github.com/diby-edu/geschool`

---

## 4. Procédure de déploiement

### 4.1 Première installation

```bash
mkdir -p /var/www/geschool && cd /var/www/geschool
git clone <URL_DU_DEPOT> .
cp .env.example .env.local && nano .env.local     # remplir toutes les valeurs
```

Node 22 dédié, sans toucher au Node système utilisé par les autres projets :

```bash
export PATH="/root/.nvm/versions/node/v22.23.1/bin:$PATH"
corepack enable && corepack prepare pnpm@latest --activate
pnpm install --frozen-lockfile
```

### 4.2 Migrations

```bash
pnpm db:migrate
```

Applique `supabase/migrations/*.sql` dans l'ordre, note ce qui l'a déjà été dans
`_migrations`, une transaction par fichier. Rejouable sans risque.

### 4.3 Build — **jamais sur le VPS**

Le build tourne en CI, ou à défaut sur le poste de développement. `next build` saturerait
l'unique vCPU plusieurs minutes (ADR-014).

```bash
# Sur le poste de développement, ou en CI
pnpm build
```

`pnpm build` produit **deux** artefacts dans `.next/standalone` : le serveur web (`server.js`)
et le worker compilé (`worker.js`, via `build:worker`/esbuild).

Le déploiement est ensuite assuré par `scripts/deploy.sh` (transfert par `tar | ssh`, donc
utilisable depuis Windows Git Bash comme depuis Linux — pas besoin de `rsync`). Il envoie
l'artefact **sans `node_modules`** (les liens symboliques pnpm ne sont pas portables), puis
installe les dépendances de PROD **sur le serveur** en mode *hoisted* (plat), bascule le lien
`current`, recharge PM2 (web + worker), vérifie la sonde de santé et **revient automatiquement
en arrière** si elle ne répond pas.

```bash
VPS_HOST=root@<ip> pnpm build && VPS_HOST=root@<ip> bash scripts/deploy.sh
```

Pour que l'URL de production soit gelée dans le bundle client, définir avant le build (fichier
`.env.production.local`, non versionné, ou variable de CI) :
`NEXT_PUBLIC_APP_URL=https://geschool.numerik360.com`.

Arborescence créée sur le serveur :

```
/var/www/geschool/
  releases/20260910231500/   versions livrées (5 conservées)
  current -> releases/…      lien actif, lu par PM2
  shared/.env.local          secrets, hors des releases
```

Le fichier `shared/.env.local` est à créer **une seule fois** sur le serveur, à partir de
`.env.example`. Il ne voyage jamais dans un artefact.

### 4.4 Service solveur

Le conteneur écoute sur le port **8110** (voir `solver-service/Dockerfile`), d'où le mapping
`8110:8110`. Créer d'abord `solver-service/.env` avec `SOLVER_SHARED_SECRET=<secret>` (le même
que dans `shared/.env.local`).

```bash
cd /var/www/geschool/solver-service
docker build -t geschool-solver:latest .
docker run -d --name gs-solver --restart unless-stopped \
  -p 127.0.0.1:8110:8110 \
  --cpus=0.5 --memory=1g --cpu-shares=512 \
  --read-only --tmpfs /tmp \
  --env-file ./.env \
  geschool-solver:latest
curl -s http://127.0.0.1:8110/health   # {"status":"ok",...}
```

`-p 127.0.0.1:8110:8110` est essentiel : sans le préfixe `127.0.0.1`, Docker écrit
directement dans iptables et **contourne UFW**, exposant le solveur à Internet.

Vérification : `curl -s http://127.0.0.1:8110/health`

### 4.5 PM2

Deux processus : `geschool` (web, port 3110) et `geschool-worker` (jobs pg-boss ;
`worker.js` lancé par `node --env-file=.env.local`). Après la première release,
`scripts/deploy.sh` s'occupe de les (re)démarrer tout seul (reload s'ils tournent, start
sinon). Démarrage manuel si besoin :

```bash
cd /var/www/geschool
pm2 start ecosystem.config.cjs      # ou --only geschool / --only geschool-worker
pm2 save
```

`pm2 startup` est déjà configuré sur ce serveur : ne pas le relancer.

> Le worker démarre, se connecte à pg-boss et **attend** : aucune file n'est encore
> enregistrée (les traitements lourds — génération d'EDT, PDF — sont faits en synchrone ou
> côté navigateur pour l'instant). C'est son état normal tant qu'aucun job n'est ajouté.

### 4.6 nginx

`/etc/nginx/sites-available/geschool` :

```nginx
server {
    listen 80;
    server_name geschool.numerik360.com;

    location / {
        proxy_pass http://127.0.0.1:3110;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade           $http_upgrade;
        proxy_set_header Connection        "upgrade";

        client_max_body_size 15m;   # photos d'élèves, imports Excel, justificatifs

        # Une génération d'emploi du temps est asynchrone côté application,
        # mais laisser de la marge aux exports PDF volumineux
        proxy_read_timeout 300s;
    }

    # Le service solveur n'est JAMAIS exposé : aucun bloc location vers 8110
}
```

```bash
ln -s /etc/nginx/sites-available/geschool /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx      # -t d'abord : 8 autres sites en dépendent
certbot --nginx -d geschool.numerik360.com
```

### 4.7 Mises à jour

Depuis le poste de développement, une seule commande :

```bash
pnpm verify && pnpm build && bash scripts/deploy.sh
```

Les **migrations ne sont jamais jouées par le script de déploiement** : elles doivent l'être
sciemment, et avant la bascule quand elles sont incompatibles avec la version précédente.

```bash
ssh $VPS_HOST 'cd /var/www/geschool/current && pnpm db:check && pnpm db:migrate'
```

`pnpm db:check` avant `db:migrate` : il vérifie la nature de la chaîne de connexion, la
résolution DNS et la connectivité réelle, et évite de découvrir le problème au milieu d'une
migration.

---

## 5. Règles de cohabitation

Ce serveur héberge huit sites en production. Ce projet ne doit rien casser.

1. **`nginx -t` avant tout `reload`.** Une erreur de syntaxe coupe les huit sites.
2. **Ne jamais toucher** `/etc/nginx/nginx.conf`, ni les blocs des autres projets.
3. **Node 22 par chemin explicite** dans `ecosystem.config.cjs`, comme le projet le plus récent du serveur. Ne jamais
   changer le Node système : plusieurs projets en dépendent.
4. **Toujours `-p 127.0.0.1:...`** sur `docker run`. Docker contourne UFW autrement.
5. **`pm2 save` après ajout**, jamais `pm2 delete all` ni `pm2 kill`.
6. **Ne pas lancer de build en heure de pointe** : `next build` sature l'unique vCPU
   plusieurs minutes. Préférer les heures creuses.
7. **Plafonner la mémoire** : `max_memory_restart` sur PM2, `--memory` sur Docker.
   2,5 Go disponibles, à partager avec 10 applications.
8. **Surveiller avant et après** : `pm2 list`, `free -h`, `uptime`.

---

## 6. Ce qui reste à faire côté infrastructure

| # | Action | Qui | État |
|---|---|---|---|
| 1 | DNS `A` : `geschool.numerik360.com` → `<IP_DU_VPS>` | vous | **fait** (10/09/2026) |
| 2 | Projet Supabase + clés dans `.env.local` | vous | **fait** — PostgreSQL 17.6, base vide |
| 3 | Dépôt git `diby-edu/geschool` | vous | **fait** |
| 4 | Upgrade CPU | vous | **écarté** — ADR-014, on reste sur 1 vCPU |
| 5 | Passer `DATABASE_URL` au Session pooler | vous | recommandé, voir §7 |
| 6 | Secrets GitHub Actions pour le déploiement automatique | vous | quand vous le souhaitez |
| 7 | Certificat TLS `certbot --nginx -d geschool.numerik360.com` | moi | premier déploiement |
| 8 | Bloc nginx + `shared/.env.local` sur le VPS | moi | premier déploiement |
| 9 | Choisir le fournisseur SMS | vous | avant le lot 5 |
| 10 | Chromium pour les PDF | moi | lot 10 |

---

## 7. Chaîne de connexion Supabase — vérification du 10/09/2026

`pnpm db:check` a été exécuté depuis le poste de développement **et** depuis le VPS.

**Configuration actuelle** : connexion **directe**,
`db.<ref>.supabase.co:5432`.

| Contrôle | Résultat |
|---|---|
| Enregistrement DNS `A` (IPv4) | **aucun** — l'hôte n'existe qu'en IPv6 |
| Enregistrement `AAAA` (IPv6) | présent |
| IPv6 global sur le VPS | **oui**, une adresse |
| Accès TCP 5432 depuis le VPS | **atteignable** |
| Connexion depuis le poste | **OK** — PostgreSQL 17.6, base vide, `pgcrypto` déjà présente |

**Donc cela fonctionne**, ici et sur le VPS. Ce n'est pas bloquant.

**Recommandation quand même : passer au Session pooler.** La raison principale n'est pas
l'IPv6, puisque le VPS en dispose — c'est le **nombre de connexions**. La connexion directe
n'est pas mutualisée, et ce projet en ouvre plusieurs simultanément : l'application web,
le worker pg-boss (jusqu'à 4 connexions persistantes), les migrations, les diagnostics. Le
pooler absorbe cela sans effort là où la connexion directe atteint son plafond, et l'erreur
qui en résulte (`too many connections`) survient toujours au pire moment.

Dans le dashboard Supabase : **Connect → Session pooler** (port 5432, hôte
`aws-0-<région>.pooler.supabase.com`, utilisateur `postgres.<ref>`).
Éviter le **Transaction pooler (6543)** : sans prepared statements, il casse les migrations
et pg-boss — `pnpm db:check` le refuse explicitement.

**À corriger aussi** : `.env.local` contient `DATABASE_URL_POOLER` avec **exactement la même
valeur** que `DATABASE_URL`. Cette variable n'est lue par aucun code du projet et peut être
supprimée ; c'est `DATABASE_URL` seule qui compte.
