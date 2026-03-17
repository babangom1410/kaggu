# Interface d'Administration — Kàggu

## Contexte

L'opérateur de la plateforme Kàggu a besoin d'un tableau de bord pour superviser les organisations, les abonnements, les licences et l'usage. Cette interface est réservée aux utilisateurs ayant `is_platform_admin = true`.

---

## Pages

| Route | Composant | Description |
|-------|-----------|-------------|
| `/admin` | `AdminDashboard` | KPIs, graphiques, activité récente |
| `/admin/organizations` | `OrganizationList` | Tableau des organisations (recherche, filtres, pagination) |
| `/admin/organizations/:id` | `OrganizationDetail` | Détail d'une org : abonnement, clés, usage |
| `/admin/plans` | `PlanManager` | CRUD des plans d'abonnement |
| `/admin/licenses` | `LicenseList` | Toutes les clés (filtres par org, statut) + actions |
| `/admin/usage` | `UsageAnalytics` | Graphiques et tableaux d'usage (filtres : org, période, type) |

---

## Dashboard — KPIs affichés

### Métriques principales

- **Organisations actives / suspendues** — nombre et ratio
- **Licences actives** — nombre total de clés avec statut `active`
- **MRR** (Monthly Recurring Revenue) — calculé à partir des abonnements actifs
- **Exports aujourd'hui / ce mois** — compteur d'événements `course_export`
- **Appels API aujourd'hui** — compteur d'événements `api_call`, avec tendance vs veille

### Graphiques

- **Exports quotidiens sur 30 jours** — courbe (recharts `LineChart`)
- **Nouvelles organisations par semaine** — barres (recharts `BarChart`)

### Fil d'activité récente

- 20 derniers événements issus de `usage_logs`
- Format : `[timestamp] [event_type] [org_name] — détails`

---

## Composants frontend

### Arborescence

```
frontend/src/components/admin/
├── AdminDashboard/
│   ├── AdminDashboard.tsx       # Page principale du dashboard
│   ├── KpiCard.tsx              # Carte de KPI individuelle
│   ├── UsageChart.tsx           # Graphique recharts (exports, orgs)
│   ├── RecentActivity.tsx       # Fil d'activité récente
│   └── index.ts
├── OrganizationList/
│   ├── OrganizationList.tsx     # Tableau paginé avec recherche/filtres
│   ├── OrganizationRow.tsx      # Ligne d'organisation dans le tableau
│   └── index.ts
├── OrganizationDetail/
│   ├── OrganizationDetail.tsx   # Page de détail d'une organisation
│   ├── SubscriptionCard.tsx     # Carte abonnement (plan, statut, dates)
│   ├── LicenseKeyCard.tsx       # Carte clé de licence (clé, statut, binding)
│   ├── UsageSummary.tsx         # Résumé d'usage de l'organisation
│   └── index.ts
├── PlanManager/
│   ├── PlanManager.tsx          # Liste et gestion des plans
│   ├── PlanForm.tsx             # Modal de création/édition de plan
│   └── index.ts
├── LicenseList/
│   ├── LicenseList.tsx          # Tableau de toutes les clés
│   ├── LicenseActions.tsx       # Boutons d'action (suspendre, révoquer)
│   ├── GenerateLicenseModal.tsx # Modal de génération de clé
│   └── index.ts
└── UsageAnalytics/
    ├── UsageAnalytics.tsx       # Page analytics avec filtres
    ├── UsageFilters.tsx         # Filtres (org, période, type d'événement)
    ├── UsageTable.tsx           # Tableau des événements d'usage
    └── index.ts
```

### Fichiers support

```
frontend/src/stores/admin-store.ts    # Store Zustand pour l'état admin
frontend/src/api/admin-api.ts         # Client HTTP pour les routes admin
frontend/src/types/admin.types.ts     # Types TypeScript (Organization, Plan, License, etc.)
```

---

## Layout admin

### `AdminLayout`

Layout dédié avec une sidebar de navigation, séparé du layout principal de l'éditeur mindmap.

**Sidebar :**
- Logo Kàggu + "Admin"
- Dashboard (`/admin`)
- Organisations (`/admin/organizations`)
- Plans (`/admin/plans`)
- Licences (`/admin/licenses`)
- Usage (`/admin/usage`)
- Séparateur
- Retour à l'éditeur (`/`)

### Protection des accès

- **Frontend :** Route gardée — redirection vers `/` si `user.is_platform_admin !== true`
- **Backend :** Middleware `admin-auth.middleware.ts` — vérifie le JWT et `is_platform_admin === true`, retourne 403 sinon

---

## Interactions clés

### Gestion des licences

| Action | Bouton | Confirmation | Effet |
|--------|--------|--------------|-------|
| **Générer** | "Nouvelle clé" | Non | Crée une clé, affiche dans un modal copiable |
| **Suspendre** | "Suspendre" | Oui | Passe le statut à `suspended`, la validation échouera |
| **Révoquer** | "Révoquer" | Oui (double confirmation) | Passe le statut à `revoked`, irréversible |
| **Régénérer** | "Régénérer" | Oui | Révoque l'ancienne clé, génère une nouvelle, réinitialise le binding |

### Gestion des organisations

| Action | Description |
|--------|-------------|
| **Créer** | Formulaire : nom, slug, email, contact, pays |
| **Modifier** | Mêmes champs + statut |
| **Suspendre** | Suspend l'org et toutes ses clés de licence |
| **Supprimer** | Soft delete (status = `deleted`), révoque toutes les clés |

### Gestion des plans

| Action | Description |
|--------|-------------|
| **Créer** | Formulaire : nom, slug, prix, limites (JSON), features (JSON) |
| **Modifier** | Mêmes champs, les abonnements existants gardent leurs limites jusqu'au renouvellement |
| **Désactiver** | `is_active = false`, le plan n'est plus proposable |

---

## Critères d'acceptation

- [ ] Le dashboard affiche les KPIs en temps réel (organisations, licences, MRR, exports, appels API)
- [ ] Les graphiques montrent les exports quotidiens (30 jours) et les nouvelles orgs (par semaine)
- [ ] Le fil d'activité affiche les 20 derniers événements
- [ ] La liste des organisations supporte recherche, filtres par statut, et pagination
- [ ] Le détail d'une organisation affiche son abonnement, ses clés et son usage
- [ ] Les plans sont gérables (CRUD) avec formulaire modal
- [ ] Les licences peuvent être générées, suspendues, révoquées et régénérées
- [ ] L'analytics permet de filtrer par organisation, période et type d'événement
- [ ] L'accès admin est protégé (frontend + backend)
- [ ] Le layout admin est séparé du layout éditeur
