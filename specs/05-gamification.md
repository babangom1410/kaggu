# Gamification — Kàggu (Post-MVP, P2)

## Contexte

Moodle supporte nativement les badges (conformes OpenBadges 2.0). Kàggu permet de créer et configurer des badges directement dans le mindmap, puis de les exporter vers Moodle.

## Fonctionnalités

### Badges Moodle (P2)

Nœud badge ajouté dans le mindmap, connecté aux activités dont l'achèvement déclenche l'attribution.

| Propriété | Type | Mapping Moodle |
|-----------|------|----------------|
| `name` | string | Nom du badge |
| `description` | string | Description |
| `image` | file upload | Image du badge (PNG, ≤ 256x256) |
| `criteria_type` | enum: manual, activity, courseset, overall | Type de critère |
| `criteria_activities` | array of node IDs | Activités à compléter |
| `expiry` | date (optionnel) | Date d'expiration |

**Visualisation mindmap :** Nœud hexagonal, couleur dorée, connecté aux activités prérequises par des arêtes en pointillé doré.

### OpenBadges (P2)

- Les badges exportés vers Moodle sont conformes OpenBadges 2.0
- L'étudiant peut exporter ses badges vers son backpack (Mozilla Open Badges, Badgr)
- Pas de développement spécifique côté Kàggu : c'est Moodle qui gère la conformité OpenBadges

## Règles métier

- Un badge doit avoir au moins un critère d'attribution
- L'image est obligatoire (proposer des icônes par défaut)
- La création de badges nécessite le plugin `local_kaggu` (pas de fonction WS native)

## Critères d'acceptation

- [ ] L'enseignant peut ajouter un nœud badge dans le mindmap
- [ ] Le badge est configurable (nom, description, image, critères)
- [ ] L'export crée le badge dans Moodle avec ses critères
- [ ] Les badges sont visualisés distinctement dans le mindmap
