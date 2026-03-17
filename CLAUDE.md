# Kàggu — Instructions pour Claude Code

## Description du projet

Kàggu est une plateforme de conception de cours Moodle avec un éditeur visuel mindmap. L'enseignant construit son parcours sous forme d'arbre de nœuds, puis l'exporte vers Moodle via les API Web Services.

## Stack technique

| Couche | Technologie | Version |
|--------|-------------|---------|
| Frontend | React + TypeScript | 18+ |
| Éditeur mindmap | ReactFlow | 11+ |
| State management | Zustand | 4+ |
| Styles | TailwindCSS | 3+ |
| Build | Vite | 5+ |
| Backend | Node.js + Express + TypeScript | 20 LTS / 4+ |
| ORM | Knex.js | latest |
| BDD (dev) | SQLite | 3 |
| BDD (prod) | PostgreSQL | 16+ |
| Client Moodle | moodle-client | latest |
| Plugin Moodle | PHP | 8.1+ |
| Graphiques admin | recharts | latest |
| LLM (post-MVP) | @anthropic-ai/sdk | latest |

## Structure monorepo

```
kàggu/
├── CLAUDE.md              ← ce fichier
├── package.json           ← workspace root (npm workspaces)
├── specs/                 ← cahier des charges (français)
├── docs/                  ← documentation technique
└── packages/
    ├── frontend/          ← React app (Vite)
    │   └── src/components/admin/  ← Dashboard admin (recharts, KPIs, CRUD)
    ├── backend/           ← API Express
    │   └── src/
    │       ├── routes/admin/           ← Routes admin (orgs, plans, licenses, usage)
    │       ├── services/license.service.ts ← Génération, validation, binding clés
    │       ├── models/                 ← Nouveaux models (organization, subscription, license-key, usage-log)
    │       └── middleware/admin-auth.middleware.ts ← JWT + is_platform_admin
    └── moodle-plugin/     ← Plugin local Moodle (PHP)
        ├── settings.php            ← Réglages licence
        ├── classes/license_manager.php ← Validation & cache licence
        └── tasks/validate_license.php  ← Cron revalidation
```

## Conventions

### Langue

- **Code et commentaires** : anglais
- **Specs et documentation** : français
- **Commits** : anglais

### Code style

- ESLint + Prettier (config partagée à la racine)
- TypeScript strict mode
- Nommage : `camelCase` pour variables/fonctions, `PascalCase` pour composants/types, `UPPER_SNAKE_CASE` pour constantes
- Fichiers : `kebab-case.ts` pour les utilitaires, `PascalCase.tsx` pour les composants React
- Un composant par fichier

### Structure des composants React

```
ComponentName/
├── ComponentName.tsx      ← composant principal
├── ComponentName.test.tsx ← tests
└── index.ts               ← re-export
```

### API REST (backend)

- Préfixe : `/api/v1/`
- Réponses JSON avec structure `{ data, error, message }`
- Codes HTTP standards (200, 201, 400, 401, 404, 500)
- Validation des entrées avec zod

## Commandes

```bash
# Installation (depuis la racine)
npm install

# Développement
npm run dev              # Lance frontend + backend en parallèle
npm run dev:frontend     # Frontend seul (Vite dev server, port 5173)
npm run dev:backend      # Backend seul (nodemon, port 3001)

# Tests
npm test                 # Tous les tests
npm run test:frontend    # Tests frontend (Vitest)
npm run test:backend     # Tests backend (Vitest)

# Build
npm run build            # Build frontend + backend
npm run build:frontend   # Build frontend (Vite → dist/)
npm run build:backend    # Build backend (tsc → dist/)

# Base de données
npm run db:migrate       # Exécuter les migrations
npm run db:seed          # Peupler la BDD avec des données de test

# Lint
npm run lint             # ESLint + Prettier check
npm run lint:fix         # Auto-fix
```

## Ordre d'implémentation

### Phase 1 — Éditeur Mindmap (MVP core)

1. Setup monorepo (package.json workspaces, Vite, Express, TypeScript)
2. Composants ReactFlow : nœuds custom (Course, Section, Resource, Activity)
3. Panneau de propriétés contextuel
4. Interactions : drag & drop, connexion, suppression, undo/redo
5. Sauvegarde locale du mindmap (Zustand + persistance)

### Phase 2 — Backend API

6. Setup Express + Knex + SQLite
7. Routes CRUD projets (`/api/v1/projects`)
8. Authentification (JWT, inscription, connexion)
9. Sauvegarde automatique (frontend → backend)

### Phase 3 — Synchronisation Moodle

10. Service de connexion Moodle (validation token)
11. Service d'export (mindmap → appels API Moodle)
12. Service d'import (cours Moodle → mindmap)
13. Table de mapping (nœuds ↔ entités Moodle)
14. Plugin local Moodle (`local_kaggu`)

### Phase 3.5 — SaaS Licensing & Administration

15. Migrations BDD (7 fichiers : organizations, subscription_plans, subscriptions, license_keys, usage_logs, organization_users, alter users)
16. Models Knex (organization, subscription, license-key, usage-log, organization-users)
17. License service (génération clés `KGU-{TIER}-{8}-{8}-{4}`, validation, binding)
18. Routes publiques de validation (`/api/v1/licenses/validate`, `/api/v1/licenses/heartbeat`)
19. Middleware admin (`admin-auth.middleware.ts`) + routes admin CRUD (orgs, plans, subscriptions, licenses, usage)
20. Plugin Moodle : `settings.php`, `license_manager.php`, tâche cron `validate_license.php`, `db/caches.php`, gardes licence+quota
21. Frontend admin (store `admin-store.ts`, API client `admin-api.ts`, types, composants dashboard + CRUD, layout admin)

### Phase 4 — Post-MVP

22. Parcours personnalisés (achèvement, restrictions, branchements)
23. Gamification (badges)
24. Types de modules supplémentaires (Livre, SCORM, H5P, Leçon, etc.)
25. Theming
26. Bibliothèque OER
27. Intégration LLM

## Dépendances entre modules

```
frontend/mindmap → frontend/panels (panneau de propriétés)
frontend/api → backend/routes (appels HTTP)
backend/services/moodle-sync → moodle-client (npm) → Moodle API
backend/services/moodle-sync → moodle-plugin (fonctions custom)
backend/services/project → backend/models (Knex)
backend/services/license → backend/models (Knex)
moodle-plugin/license_manager → backend/routes/licenses (validation HTTP)
frontend/admin → backend/routes/admin/* (appels HTTP)
```

## Specs de référence

Les spécifications détaillées sont dans `specs/` :

- `00-vision.md` — Vision produit et périmètre MVP
- `01-architecture.md` — Architecture technique
- `02-mindmap-editor.md` — Éditeur mindmap (types de nœuds, interactions, validation)
- `03-moodle-integration.md` — Intégration Moodle (API, mapping, sync)
- `04-parcours-personnalises.md` — Parcours personnalisés (P1)
- `05-gamification.md` — Gamification (P2)
- `06-theming.md` — Personnalisation graphique (P2)
- `07-bibliotheque-oer.md` — Bibliothèque OER (P2)
- `08-llm-integration.md` — Intégration LLM (P2)
- `09-user-stories.md` — User stories priorisées (MoSCoW)
- `10-saas-licensing.md` — Système de licensing SaaS (modèle de données, plans, clés, validation)
- `11-admin-dashboard.md` — Interface d'administration (pages, composants, KPIs)
- `docs/moodle-api-reference.md` — Référence API Moodle
