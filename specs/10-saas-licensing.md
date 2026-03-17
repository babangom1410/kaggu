# Système de Licensing SaaS — Kàggu

## Contexte

Pour rendre Kàggu viable en SaaS, un système d'abonnement par organisation et de clés de licence activables dans le plugin Moodle `local_kaggu` est nécessaire. Ce document décrit le modèle de données, les plans tarifaires, le format des clés, le flux de validation et les mesures de sécurité.

---

## Modèle de données

### Nouvelles tables (6)

#### `organizations`

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | uuid | Identifiant unique |
| `name` | varchar(255) | Nom de l'organisation |
| `slug` | varchar(100), unique | Identifiant URL-friendly |
| `contact_email` | varchar(255) | Email du contact principal |
| `contact_name` | varchar(255) | Nom du contact principal |
| `country` | char(2) | Code pays ISO 3166-1 alpha-2 |
| `metadata` | jsonb | Données supplémentaires (secteur, taille, etc.) |
| `status` | enum | `active` / `suspended` / `deleted` |
| `created_at` | timestamp | Date de création |
| `updated_at` | timestamp | Date de dernière modification |

#### `subscription_plans`

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | uuid | Identifiant unique |
| `name` | varchar(100) | Nom du plan (ex: "Pro") |
| `slug` | varchar(50), unique | Identifiant technique (ex: "pro") |
| `description` | text | Description marketing |
| `price_monthly_cents` | integer | Prix mensuel en centimes |
| `price_yearly_cents` | integer | Prix annuel en centimes |
| `currency` | char(3) | Code devise ISO 4217 (ex: "EUR") |
| `limits` | jsonb | Limites du plan (voir ci-dessous) |
| `features` | jsonb | Fonctionnalités activées (voir ci-dessous) |
| `is_active` | boolean | Plan disponible à la souscription |
| `sort_order` | integer | Ordre d'affichage |
| `created_at` | timestamp | Date de création |
| `updated_at` | timestamp | Date de dernière modification |

**Structure `limits` (jsonb) :**
```json
{
  "max_moodle_instances": 5,
  "max_courses_per_month": 100,
  "max_api_calls_per_day": 10000,
  "max_users": 25
}
```

**Structure `features` (jsonb) :**
```json
{
  "llm_enabled": true,
  "oer_enabled": true,
  "collaboration": true,
  "priority_support": true
}
```

#### `subscriptions`

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | uuid | Identifiant unique |
| `organization_id` | uuid, FK → organizations | Organisation abonnée |
| `plan_id` | uuid, FK → subscription_plans | Plan souscrit |
| `status` | enum | `trialing` / `active` / `past_due` / `canceled` / `expired` |
| `current_period_start` | timestamp | Début de la période en cours |
| `current_period_end` | timestamp | Fin de la période en cours |
| `trial_ends_at` | timestamp, nullable | Date de fin d'essai |
| `canceled_at` | timestamp, nullable | Date d'annulation |
| `payment_provider` | varchar(50), nullable | Fournisseur de paiement (ex: "stripe") |
| `payment_provider_id` | varchar(255), nullable | Identifiant chez le fournisseur |
| `created_at` | timestamp | Date de création |
| `updated_at` | timestamp | Date de dernière modification |

#### `license_keys`

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | uuid | Identifiant unique |
| `organization_id` | uuid, FK → organizations | Organisation propriétaire |
| `subscription_id` | uuid, FK → subscriptions | Abonnement associé |
| `key` | varchar(40), unique | Clé en clair (affichage admin) |
| `key_hash` | varchar(64), index | SHA-256 de la clé (lookups) |
| `status` | enum | `active` / `suspended` / `revoked` / `expired` |
| `moodle_url` | varchar(500), nullable | URL Moodle liée (binding) |
| `moodle_site_id` | varchar(255), nullable | Identifiant du site Moodle |
| `activated_at` | timestamp, nullable | Date de première activation |
| `last_validated_at` | timestamp, nullable | Dernière validation réussie |
| `expires_at` | timestamp, nullable | Date d'expiration |
| `metadata` | jsonb | Données supplémentaires |
| `created_at` | timestamp | Date de création |
| `updated_at` | timestamp | Date de dernière modification |

#### `usage_logs`

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | uuid | Identifiant unique |
| `organization_id` | uuid, FK → organizations | Organisation concernée |
| `license_key_id` | uuid, FK → license_keys, nullable | Clé utilisée |
| `event_type` | varchar(50) | Type d'événement (voir ci-dessous) |
| `moodle_url` | varchar(500), nullable | URL Moodle source |
| `details` | jsonb | Détails de l'événement |
| `ip_address` | varchar(45) | Adresse IP source |
| `created_at` | timestamp, index | Date de l'événement |

**Types d'événements (`event_type`) :**
- `license_validate` — Validation d'une clé de licence
- `api_call` — Appel API (export, import, sync)
- `course_export` — Export d'un cours vers Moodle
- `module_create` — Création d'un module
- `admin_license_create` — Création d'une clé (par un admin)
- `admin_license_suspend` — Suspension d'une clé
- `admin_license_revoke` — Révocation d'une clé
- `admin_org_create` — Création d'une organisation
- `admin_org_suspend` — Suspension d'une organisation

#### `organization_users`

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | uuid | Identifiant unique |
| `organization_id` | uuid, FK → organizations | Organisation |
| `user_id` | uuid, FK → users | Utilisateur |
| `role` | enum | `owner` / `admin` / `member` |
| `created_at` | timestamp | Date d'ajout |
| `updated_at` | timestamp | Date de dernière modification |

**Contrainte unique :** `(organization_id, user_id)`

### Modification de la table existante `users`

Ajouter la colonne :
- `is_platform_admin` : boolean, default `false` — Indique si l'utilisateur a accès au tableau de bord d'administration de la plateforme Kàggu.

---

## Plans d'abonnement

| | **Trial** | **Starter** | **Pro** | **Enterprise** |
|---|---|---|---|---|
| **Prix** | 0 € | 29 €/mois | 99 €/mois | Sur devis |
| **Durée** | 14 jours | Mensuel / Annuel | Mensuel / Annuel | Annuel |
| **Instances Moodle** | 1 | 1 | 5 | Illimité |
| **Cours exportés/mois** | 5 | 20 | 100 | Illimité |
| **Appels API/jour** | 100 | 1 000 | 10 000 | Illimité |
| **Utilisateurs/org** | 1 | 5 | 25 | Illimité |
| **Clés de licence** | 1 | 1 | 5 | Illimité |
| **LLM** | Non | Non | Oui | Oui |
| **Support** | — | Email | Email prioritaire | Dédié |

> Les limites sont stockées en JSON dans `subscription_plans.limits` → configurables via l'interface admin sans toucher au code.

---

## Format des clés de licence

### Structure

```
KGU-{TIER}-{8CHARS}-{8CHARS}-{4CHECK}
```

**Exemple :** `KGU-PRO-A7X9K2M4-B3N8P1Q5-R2W6`

### Spécifications

- **Alphabet sans ambiguïté :** `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (30 caractères, sans `0OIL1`)
- **Espace combinatoire :** 30^16 ≈ 4.3×10²³ combinaisons → force brute impossible
- **Génération :** via `crypto.randomBytes()` côté backend
- **Stockage :**
  - `key` : clé en clair, pour affichage dans l'interface admin
  - `key_hash` : SHA-256 de la clé, pour les lookups indexés (validation)
- **Préfixe TIER :** `TRI` (Trial), `STR` (Starter), `PRO` (Pro), `ENT` (Enterprise)

---

## Flux de validation (Plugin Moodle → Backend Kàggu)

### Séquence

```
1. Admin Moodle installe local_kaggu
   → Saisit la clé de licence dans les réglages du plugin

2. Plugin envoie POST /api/v1/licenses/validate
   → Payload : { key, moodle_url, site_id, moodle_version, plugin_version }

3. Backend reçoit la requête
   → Calcule key_hash = SHA-256(key)
   → Lookup par key_hash dans license_keys
   → Vérifie :
     a. Clé trouvée et status = active
     b. Abonnement associé actif (subscriptions.status = active/trialing)
     c. Non expirée (expires_at > now ou null)
     d. Binding URL : moodle_url correspond ou est null (premier usage)

4. Premier usage (moodle_url est null dans license_keys)
   → Lie la clé à l'URL Moodle (binding anti-partage)
   → Enregistre moodle_site_id
   → Met à jour activated_at

5. Réponse au plugin
   → {
       valid: true,
       plan: { name, slug },
       limits: { max_courses_per_month, max_api_calls_per_day, ... },
       features: { llm_enabled, oer_enabled, ... },
       expires_at: "2027-03-16T00:00:00Z",
       next_check_interval: 86400  // secondes (24h par défaut)
     }

6. Plugin cache la réponse
   → Utilise Moodle Cache API (type: application)
   → TTL = next_check_interval (défaut 24h)

7. Tâche cron Moodle
   → Revalide la licence toutes les 24h

8. Grâce en cas de panne réseau
   → Cache périmé utilisable jusqu'à 72h
   → Au-delà : mode dégradé (lecture seule, pas d'export)
```

### Endpoint de validation

**`POST /api/v1/licenses/validate`**

Requête :
```json
{
  "key": "KGU-PRO-A7X9K2M4-B3N8P1Q5-R2W6",
  "moodle_url": "https://moodle.example.com",
  "site_id": "abc123def456",
  "moodle_version": "4.3",
  "plugin_version": "1.0.0"
}
```

Réponse (succès) :
```json
{
  "valid": true,
  "plan": { "name": "Pro", "slug": "pro" },
  "limits": {
    "max_moodle_instances": 5,
    "max_courses_per_month": 100,
    "max_api_calls_per_day": 10000,
    "max_users": 25
  },
  "features": {
    "llm_enabled": true,
    "oer_enabled": true,
    "collaboration": true,
    "priority_support": true
  },
  "expires_at": "2027-03-16T00:00:00Z",
  "next_check_interval": 86400
}
```

Réponse (échec) :
```json
{
  "valid": false,
  "error": "LICENSE_EXPIRED",
  "message": "Cette licence a expiré le 2026-01-15."
}
```

### Endpoint heartbeat

**`POST /api/v1/licenses/heartbeat`**

Check léger périodique (pas de payload lourd). Vérifie uniquement la validité de la clé et retourne un booléen + la date d'expiration.

---

## Sécurité

### Transport

- **HTTPS obligatoire** pour l'endpoint de validation
- L'endpoint `/api/v1/licenses/validate` est **public** (pas de JWT) car appelé par le plugin PHP côté serveur, pas par un navigateur
- Pas de CORS nécessaire (appels serveur PHP → serveur Node.js)

### Rate limiting

- **10 requêtes/minute/IP** sur les endpoints de validation (`/licenses/validate`, `/licenses/heartbeat`)
- Prévient le brute force de clés

### Binding d'instance

- Une clé de licence est **liée à une URL Moodle** au premier usage
- Une clé = une instance Moodle
- Pour changer l'instance, l'administrateur Kàggu doit réinitialiser le binding

### Audit

- Toutes les actions admin sont loguées dans `usage_logs` avec `event_type` préfixé `admin_`
- Les validations de licence sont loguées (`license_validate`)
- L'adresse IP est enregistrée pour chaque événement

---

## Routes backend

### Routes publiques (plugin Moodle, pas de JWT)

| Méthode | Route | Description |
|---------|-------|-------------|
| POST | `/api/v1/licenses/validate` | Valider une clé de licence |
| POST | `/api/v1/licenses/heartbeat` | Check léger périodique |

### Routes admin (JWT + `is_platform_admin`)

| Méthode | Route | Description |
|---------|-------|-------------|
| GET / POST | `/api/v1/admin/organizations` | Lister / Créer des organisations |
| GET / PUT / DELETE | `/api/v1/admin/organizations/:id` | Détail / Modifier / Supprimer |
| GET / POST | `/api/v1/admin/subscriptions` | Lister / Créer des abonnements |
| PUT | `/api/v1/admin/subscriptions/:id` | Modifier (changer plan, statut) |
| GET / POST | `/api/v1/admin/plans` | Lister / Créer des plans |
| PUT | `/api/v1/admin/plans/:id` | Modifier un plan |
| GET / POST | `/api/v1/admin/licenses` | Lister / Générer des clés |
| PUT | `/api/v1/admin/licenses/:id` | Suspendre / Révoquer une clé |
| POST | `/api/v1/admin/licenses/:id/regenerate` | Régénérer une clé |
| GET | `/api/v1/admin/usage` | Stats agrégées (filtres : org, période, type) |
| GET | `/api/v1/admin/usage/dashboard` | Métriques pré-calculées pour le dashboard |

---

## Critères d'acceptation

- [ ] Les 6 tables sont créées via des migrations Knex
- [ ] La colonne `is_platform_admin` est ajoutée à la table `users`
- [ ] Les clés de licence sont générées au format `KGU-{TIER}-{8}-{8}-{4}`
- [ ] L'endpoint de validation vérifie : statut clé, statut abonnement, expiration, binding URL
- [ ] Le binding URL est appliqué au premier usage
- [ ] Le rate limiting est actif sur les endpoints de validation (10 req/min/IP)
- [ ] Les actions admin sont loguées dans `usage_logs`
- [ ] Les endpoints de validation sont publics, les endpoints admin sont protégés (JWT + `is_platform_admin`)
