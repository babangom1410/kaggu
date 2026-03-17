# Architecture Technique — Kàggu

## Schéma d'architecture

```
┌─────────────────────────────────────────────────────────┐
│                    NAVIGATEUR                            │
│  ┌───────────────────────────────────────────────────┐  │
│  │              Frontend (React 18+)                 │  │
│  │  ┌─────────────┐  ┌──────────┐  ┌─────────────┐  │  │
│  │  │  ReactFlow   │  │ Panneau  │  │  Gestion    │  │  │
│  │  │  (Mindmap)   │  │ Proprié- │  │  Projets    │  │  │
│  │  │              │  │ tés      │  │             │  │  │
│  │  └─────────────┘  └──────────┘  └─────────────┘  │  │
│  │                                                    │  │
│  │  ┌─────────────────────────────────────────────┐   │  │
│  │  │  Admin Dashboard (recharts, KPIs, CRUD)     │   │  │
│  │  │  (accessible si is_platform_admin = true)   │   │  │
│  │  └─────────────────────────────────────────────┘   │  │
│  └────────────────────────┬──────────────────────────┘  │
│                           │ REST API                     │
└───────────────────────────┼─────────────────────────────┘
                            │
┌───────────────────────────┼─────────────────────────────┐
│                    Backend (Node.js + Express)            │
│  ┌────────────┐  ┌───────┴──────┐  ┌────────────────┐  │
│  │  Projects   │  │  Moodle      │  │  Auth          │  │
│  │  CRUD       │  │  Sync        │  │  (token)       │  │
│  │             │  │  Service     │  │                │  │
│  └──────┬─────┘  └───────┬──────┘  └────────────────┘  │
│                                                          │
│  ┌────────────────┐  ┌──────────────────────────────┐   │
│  │  License        │  │  Admin Routes               │   │
│  │  Validation     │  │  (JWT + is_platform_admin)  │   │
│  │  Service        │  │  CRUD orgs/plans/licenses   │   │
│  └────────────────┘  └──────────────────────────────┘   │
│         │                │                               │
│  ┌──────┴─────┐  ┌───────┴──────────────────────────┐   │
│  │  SQLite /   │  │  moodle-client (npm)             │   │
│  │  PostgreSQL │  │  → Moodle Web Services API       │   │
│  └────────────┘  └──────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                            │
                            │ HTTP/REST
                            ▼
┌─────────────────────────────────────────────────────────┐
│                 Instance Moodle                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │  Web Services API (REST / JSON)                    │ │
│  │  + Plugin local Kàggu (endpoints complémentaires)  │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

## Stack technique

| Couche | Technologie | Version | Justification |
|--------|-------------|---------|---------------|
| Frontend | React | 18+ | Écosystème mature, large communauté |
| Éditeur mindmap | ReactFlow | 11+ | Bibliothèque spécialisée node-based editors, performante, extensible |
| Styles | TailwindCSS | 3+ | Prototypage rapide, design system cohérent |
| Backend | Node.js + Express | 20 LTS / 4+ | JavaScript full-stack, écosystème npm partagé |
| Client Moodle | moodle-client | latest | Wrapper typé pour l'API Moodle Web Services |
| BDD (dev) | SQLite | 3 | Zéro configuration, fichier unique |
| BDD (prod) | PostgreSQL | 16+ | Robuste, scalable |
| ORM | Knex.js | latest | Query builder, migrations, support SQLite + PostgreSQL |
| LLM (post-MVP) | Anthropic SDK | latest | API Claude pour la génération de contenu |
| Graphiques admin | recharts | latest | Composants React pour les graphiques du dashboard admin |
| Plugin Moodle | PHP | 8.1+ | Requis par Moodle 4.x |

## Structure monorepo

```
kàggu/
├── CLAUDE.md                  # Instructions pour Claude Code
├── package.json               # Workspace root
├── specs/                     # Cahier des charges
├── docs/                      # Documentation technique
└── packages/
    ├── frontend/              # Application React
    │   ├── package.json
    │   ├── src/
    │   │   ├── components/
    │   │   │   ├── mindmap/   # Composants ReactFlow (nœuds, arêtes, contrôles)
    │   │   │   ├── panels/    # Panneau de propriétés
    │   │   │   ├── layout/    # Shell de l'application
    │   │   │   └── common/    # Composants réutilisables
    │   │   ├── hooks/         # Custom hooks
    │   │   ├── stores/        # State management (Zustand)
    │   │   ├── types/         # TypeScript interfaces
    │   │   ├── utils/         # Fonctions utilitaires
    │   │   └── api/           # Client HTTP (appels backend)
    │   └── vite.config.ts
    ├── backend/               # API Express
    │   ├── package.json
    │   ├── src/
    │   │   ├── routes/        # Routes Express
    │   │   │   ├── admin/     # Routes admin (orgs, plans, licenses, usage)
    │   │   │   └── licenses/  # Routes publiques de validation
    │   │   ├── services/      # Logique métier
    │   │   │   ├── project.service.ts
    │   │   │   ├── moodle-sync.service.ts
    │   │   │   └── license.service.ts    # Génération, validation, binding
    │   │   ├── models/        # Modèles Knex
    │   │   │   ├── organization.model.ts
    │   │   │   ├── subscription.model.ts
    │   │   │   ├── license-key.model.ts
    │   │   │   └── usage-log.model.ts
    │   │   ├── middleware/     # Auth, validation, error handling
    │   │   │   └── admin-auth.middleware.ts  # JWT + is_platform_admin
    │   │   └── config/        # Configuration, variables d'environnement
    │   └── knexfile.ts
    └── moodle-plugin/         # Plugin local Moodle (PHP)
        ├── version.php
        ├── settings.php       # Réglages admin (clé de licence)
        ├── db/
        │   ├── services.php   # Déclaration des Web Services
        │   └── caches.php     # Définition du cache licence
        ├── classes/
        │   ├── external/      # Fonctions externes
        │   └── license_manager.php  # Validation et cache licence
        ├── tasks/
        │   └── validate_license.php # Tâche cron de revalidation
        └── lang/
            └── en/
                └── local_kaggu.php
```

## Flux de données

### Création d'un cours (flux principal)

```
1. Enseignant crée un projet dans Kàggu
   → POST /api/projects → sauvegarde en BDD locale

2. Enseignant construit le mindmap (ajout de nœuds, configuration)
   → Sauvegarde automatique toutes les 30s
   → PUT /api/projects/:id → mise à jour du JSON mindmap en BDD

3. Enseignant lance l'export vers Moodle
   → POST /api/projects/:id/export
   → Backend lit le mindmap JSON
   → Transforme l'arbre en appels API Moodle séquentiels :
     a. core_course_create_courses (crée le cours)
     b. Pour chaque section : mise à jour via core_course_update_courses
     c. Pour chaque module : appel mod_* correspondant
   → Stocke le mapping (nœud ID ↔ Moodle ID) en BDD
   → Retourne le résultat (succès/erreurs) au frontend

4. Synchronisation ultérieure
   → Le mapping permet de mettre à jour un cours existant
   → Détection des différences (diff) entre mindmap local et état Moodle
```

### Validation de licence (Plugin Moodle → Backend)

```
1. Admin Moodle saisit la clé de licence dans les réglages de local_kaggu
   → Plugin appelle POST /api/v1/licenses/validate (clé, URL Moodle, site_id)

2. Backend vérifie la clé (hash SHA-256 → lookup)
   → Statut clé, statut abonnement, expiration, binding URL
   → Premier usage : lie la clé à l'URL Moodle (anti-partage)

3. Réponse au plugin : plan, limites, features, expiration, intervalle de revalidation
   → Plugin cache la réponse (Moodle Cache API, TTL 24h)

4. Tâche cron Moodle revalide toutes les 24h
   → Grâce réseau : cache périmé valide 72h, puis mode dégradé

5. Chaque appel de fonction externe (create_module, etc.) vérifie
   la licence + les quotas avant exécution
```

### Import d'un cours existant

```
1. Enseignant saisit l'URL/ID du cours Moodle
   → POST /api/projects/import

2. Backend appelle core_course_get_contents
   → Récupère la structure complète du cours

3. Backend transforme la structure Moodle en mindmap JSON
   → Crée les nœuds (cours, sections, modules)
   → Génère les arêtes (relations parent-enfant)

4. Retourne le mindmap au frontend pour édition
```

## Authentification

### Connexion Moodle

L'authentification vers Moodle utilise les **tokens Web Services** :

1. L'enseignant génère un token dans Moodle (Administration > Plugins > Web Services > Manage tokens)
2. Il saisit dans Kàggu : URL de l'instance Moodle + token
3. Le backend valide le token via `core_webservice_get_site_info`
4. Le token est stocké chiffré en BDD, associé au projet

**Prérequis Moodle :**
- Web Services activés (Administration > Advanced features)
- Protocole REST activé
- Service externe créé avec les fonctions nécessaires
- Token généré pour un utilisateur avec les capabilities requises

### Authentification utilisateur Kàggu (MVP)

Pour le MVP, authentification simple :
- Utilisateur local (email + mot de passe hashé bcrypt)
- JWT pour les sessions API
- Pas d'OAuth2 externe dans le MVP

### Rôle administrateur plateforme

- Colonne `is_platform_admin` (boolean, default `false`) sur la table `users`
- Les routes `/api/v1/admin/*` sont protégées par le middleware `admin-auth.middleware.ts` : vérifie le JWT **et** `is_platform_admin === true`, retourne 403 sinon
- Les routes `/api/v1/licenses/validate` et `/api/v1/licenses/heartbeat` sont **publiques** (pas de JWT) car appelées par le plugin PHP côté serveur

## Déploiement

```yaml
# docker-compose.yml (production)
services:
  frontend:
    build: ./packages/frontend
    ports: ["3000:80"]
    # Nginx servant le build React

  backend:
    build: ./packages/backend
    ports: ["3001:3001"]
    environment:
      - DATABASE_URL=postgresql://...
      - JWT_SECRET=...
    depends_on:
      - db

  db:
    image: postgres:16
    volumes:
      - pgdata:/var/lib/postgresql/data
    environment:
      - POSTGRES_DB=kaggu
      - POSTGRES_USER=kaggu
      - POSTGRES_PASSWORD=...

volumes:
  pgdata:
```

## Notes de déploiement

- L'endpoint `/api/v1/licenses/validate` doit être accessible publiquement depuis les instances Moodle (pas de restriction réseau interne)
- Pas de CORS nécessaire sur cet endpoint (appels serveur PHP → serveur Node.js, pas de navigateur)

## Contraintes techniques

- **CORS** : Le backend autorise les requêtes du frontend (même domaine ou proxy en prod)
- **Rate limiting** : Limiter les appels API Moodle (Moodle peut bloquer les IP en cas d'abus)
- **Taille des payloads** : Les mindmaps complexes peuvent générer de gros JSON (limit body parser à 10 MB)
- **Timeout** : L'export vers Moodle peut être long (cours avec beaucoup de modules) → traitement asynchrone avec feedback de progression
