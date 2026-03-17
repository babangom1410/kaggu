# Intégration Moodle — Kàggu

## Contexte

Kàggu communique avec Moodle via les **Web Services API** (protocole REST, format JSON). Le backend Kàggu joue le rôle de client API, transformant le mindmap en appels séquentiels vers l'instance Moodle de l'enseignant.

**Bibliothèque client :** `moodle-client` (npm) — wrapper typé pour les fonctions Web Services.

## Acteurs

- **Enseignant** : configure la connexion Moodle, déclenche l'export/import
- **Backend Kàggu** : orchestre les appels API, gère le mapping et les erreurs
- **Instance Moodle** : reçoit les appels API et applique les modifications

## Configuration de la connexion (P0)

### Prérequis côté Moodle

1. **Activer les Web Services** : Administration du site > Fonctionnalités avancées > Activer les services Web
2. **Activer le protocole REST** : Administration > Plugins > Services Web > Gérer les protocoles
3. **Créer un service externe** avec les fonctions listées ci-dessous
4. **Créer un token** pour un utilisateur ayant le rôle gestionnaire (ou les capabilities nécessaires)

### Configuration dans Kàggu

| Champ | Type | Description |
|-------|------|-------------|
| URL Moodle | url | Ex: `https://moodle.example.com` |
| Token | string | Token Web Services généré dans Moodle |

**Validation de la connexion :**
- Appel à `core_webservice_get_site_info` pour vérifier le token
- Vérification de la version Moodle (≥ 3.9)
- Vérification que les fonctions nécessaires sont autorisées

## Endpoints API Moodle utilisés

### Gestion des cours (P0)

#### `core_course_create_courses`

Crée un ou plusieurs cours.

**Paramètres d'entrée :**
```json
{
  "courses": [{
    "fullname": "Physique Quantique L3",
    "shortname": "PQ-L3",
    "categoryid": 5,
    "summary": "<p>Description du cours</p>",
    "format": "topics",
    "startdate": 1704067200,
    "enddate": 1719792000,
    "visible": 1
  }]
}
```

**Réponse :**
```json
[{ "id": 42, "shortname": "PQ-L3" }]
```

**Mapping depuis le mindmap :** Nœud de type `course` → paramètres du cours.

#### `core_course_update_courses`

Met à jour un cours existant (y compris la structure des sections).

**Usage :** Mise à jour des métadonnées du cours et création/réorganisation des sections.

#### `core_course_get_contents`

Récupère la structure complète d'un cours (sections + modules).

**Paramètres :** `courseid` (number)

**Réponse :** Tableau de sections, chacune contenant un tableau de modules avec leurs propriétés.

**Usage :** Import d'un cours existant dans le mindmap.

#### `core_course_get_categories`

Liste les catégories de cours disponibles.

**Usage :** Alimenter le sélecteur de catégorie dans le panneau de propriétés du nœud cours.

### Gestion des modules (P0)

Les modules sont créés via des fonctions spécifiques à chaque type.

#### Création de modules — Approche

Moodle ne fournit pas de fonction Web Service universelle pour créer un module. La stratégie est :

1. **Fonctions `mod_*_add_instance`** (quand elles existent) — disponibles pour certains modules
2. **Plugin local Kàggu** — pour les modules sans fonction de création native

#### Fonctions natives disponibles

| Module | Fonction de création | Disponible nativement |
|--------|---------------------|----------------------|
| Devoir (assign) | — | Non → plugin requis |
| Quiz | — | Non → plugin requis |
| Forum | `mod_forum_add_discussion` (discussion, pas le forum) | Non → plugin requis |
| URL | — | Non → plugin requis |
| Page | — | Non → plugin requis |
| Fichier (resource) | — | Non → plugin requis |

> **Constat :** Moodle ne fournit pas de fonction Web Service pour **créer** des instances de modules (activités/ressources). Les fonctions `mod_*` existantes gèrent le contenu des modules déjà créés (ex: `mod_forum_add_discussion` ajoute une discussion dans un forum existant).

#### Solution : Plugin local Kàggu

**Prérequis :** Une clé de licence Kàggu valide est requise pour le fonctionnement du plugin. Sans licence active, le plugin fonctionne en mode dégradé (lecture seule, pas d'export). Voir `specs/10-saas-licensing.md` pour le flux de validation.

Le plugin Moodle local `local_kaggu` expose les fonctions manquantes :

| Fonction | Description |
|----------|-------------|
| `local_kaggu_create_module` | Crée un module (activité ou ressource) dans une section donnée |
| `local_kaggu_update_module` | Met à jour les paramètres d'un module existant |
| `local_kaggu_delete_module` | Supprime un module |
| `local_kaggu_reorder_modules` | Réordonne les modules dans une section |

**Paramètres de `local_kaggu_create_module` :**
```json
{
  "courseid": 42,
  "sectionnum": 1,
  "moduletype": "assign",
  "name": "TP Mécanique Quantique",
  "intro": "<p>Description du devoir</p>",
  "options": {
    "duedate": 1710288000,
    "grade": 20,
    "submissiontype": "file"
  }
}
```

**Réponse :**
```json
{
  "cmid": 128,
  "moduletype": "assign",
  "instanceid": 56
}
```

#### Garde licence + quota

Chaque fonction externe (`local_kaggu_create_module`, `local_kaggu_update_module`, etc.) doit vérifier avant exécution :

1. **Licence valide** : Appel au `license_manager` pour vérifier le cache (ou revalider si périmé)
2. **Quota non dépassé** : Vérification des limites du plan (cours/mois, appels API/jour)

En cas d'échec, la fonction retourne une erreur structurée (voir table ci-dessous).

### Fichiers plugin liés au licensing

| Fichier | Description |
|---------|-------------|
| `settings.php` | Page de réglages admin du plugin : champ « License Key » |
| `classes/license_manager.php` | Classe gérant la validation, le cache et le mode dégradé |
| `tasks/validate_license.php` | Tâche cron planifiée (24h) : revalide la licence |
| `db/caches.php` | Définition du cache Moodle (`kaggu_license`, type application, TTL 24h) |

### Achèvement d'activité (P1)

#### `core_completion_update_activity_completion_status_manually`

Active/désactive le marquage manuel d'achèvement.

#### `core_completion_get_activities_completion_status`

Récupère les statuts d'achèvement pour un utilisateur dans un cours.

**Usage post-MVP :** Configurer les critères d'achèvement des activités depuis le mindmap.

### Badges (P2)

#### `core_badges_get_user_badges`

Récupère les badges d'un utilisateur.

> **Note :** Les fonctions de création de badges ne sont pas disponibles nativement dans l'API Web Services. Le plugin local devra les exposer.

### Groupes (P1)

#### `core_group_create_groups`

Crée des groupes dans un cours.

#### `core_group_add_group_members`

Ajoute des membres à un groupe.

**Usage post-MVP :** Gestion des groupes pour les parcours personnalisés.

## Mapping Mindmap → Moodle

### Algorithme d'export

```
FUNCTION exportToMoodle(mindmap, moodleConfig):
  // 1. Valider la structure du mindmap
  errors = validateMindmap(mindmap)
  IF errors → ABORT avec rapport d'erreurs

  // 2. Créer ou mettre à jour le cours
  courseNode = findCourseNode(mindmap)
  IF mapping.courseId EXISTS:
    updateCourse(moodleConfig, mapping.courseId, courseNode.data)
  ELSE:
    courseId = createCourse(moodleConfig, courseNode.data)
    saveMapping(courseNode.id, courseId)

  // 3. Créer les sections
  sectionNodes = findSectionNodes(mindmap, courseNode)
  FOR EACH sectionNode IN sectionNodes (ordered by position):
    sectionNum = ensureSection(courseId, sectionNode.data)
    saveMapping(sectionNode.id, sectionNum)

  // 4. Créer les modules (ressources et activités)
  FOR EACH sectionNode IN sectionNodes:
    moduleNodes = findModuleNodes(mindmap, sectionNode)
    FOR EACH moduleNode IN moduleNodes (ordered by position):
      IF mapping[moduleNode.id] EXISTS:
        updateModule(mapping[moduleNode.id], moduleNode.data)
      ELSE:
        cmid = createModule(courseId, sectionNum, moduleNode)
        saveMapping(moduleNode.id, cmid)

  // 5. Retourner le rapport
  RETURN { success: true, courseId, courseUrl, modulesCreated, modulesUpdated }
```

### Table de mapping

Stockée en BDD locale, elle fait le lien entre les nœuds du mindmap et les entités Moodle :

| Colonne | Type | Description |
|---------|------|-------------|
| `project_id` | uuid | ID du projet Kàggu |
| `node_id` | string | ID du nœud dans le mindmap |
| `moodle_type` | enum | course, section, module |
| `moodle_id` | number | ID de l'entité dans Moodle (courseid, section number, cmid) |
| `last_synced` | datetime | Dernière synchronisation |
| `checksum` | string | Hash des données pour détecter les changements |

## Algorithme d'import

```
FUNCTION importFromMoodle(moodleConfig, courseId):
  // 1. Récupérer la structure du cours
  contents = callMoodle('core_course_get_contents', { courseid: courseId })
  courseInfo = callMoodle('core_course_get_courses', { ids: [courseId] })

  // 2. Créer le nœud cours (racine)
  courseNode = createNode('course', courseInfo, position: center)

  // 3. Pour chaque section, créer un nœud
  FOR EACH section IN contents:
    sectionNode = createNode('section', section, position: computed)
    createEdge(courseNode, sectionNode)

    // 4. Pour chaque module dans la section
    FOR EACH module IN section.modules:
      moduleType = mapMoodleModuleType(module.modname)
      moduleNode = createNode(moduleType, module, position: computed)
      createEdge(sectionNode, moduleNode)

  // 5. Calculer les positions (layout automatique en arbre)
  applyTreeLayout(nodes, edges)

  // 6. Sauvegarder le mapping
  saveAllMappings(projectId, nodes, moodleEntities)

  RETURN { nodes, edges }
```

## Gestion des erreurs

### Types d'erreurs

| Code | Type | Cause | Action |
|------|------|-------|--------|
| `MOODLE_UNREACHABLE` | Réseau | Instance Moodle inaccessible | Réessayer + vérifier l'URL |
| `INVALID_TOKEN` | Auth | Token invalide ou expiré | Demander un nouveau token |
| `MISSING_CAPABILITY` | Auth | Permissions insuffisantes | Afficher les capabilities requises |
| `MISSING_FUNCTION` | Config | Fonction WS non activée | Guider l'activation |
| `COURSE_EXISTS` | Métier | Shortname déjà utilisé | Proposer de mettre à jour ou renommer |
| `VALIDATION_ERROR` | Métier | Données invalides côté Moodle | Afficher le champ en erreur |
| `PLUGIN_NOT_INSTALLED` | Config | Plugin local_kaggu absent | Guider l'installation |
| `LICENSE_INVALID` | Licence | Clé de licence invalide ou introuvable | Vérifier la clé dans les réglages du plugin |
| `LICENSE_EXPIRED` | Licence | Licence expirée | Renouveler l'abonnement |
| `LICENSE_SUSPENDED` | Licence | Licence suspendue par l'admin Kàggu | Contacter le support |
| `QUOTA_EXCEEDED` | Licence | Limite du plan atteinte (cours/mois, API/jour) | Upgrader le plan ou attendre le renouvellement |

### Stratégie de résilience

- **Export partiel** : Si un module échoue, les autres sont quand même créés. Le rapport final liste les succès et les échecs.
- **Retry automatique** : 3 tentatives pour les erreurs réseau (avec backoff exponentiel).
- **Rollback** : Pas de rollback automatique (trop complexe). En cas d'échec partiel, le mapping permet de reprendre l'export là où il s'est arrêté.

## Synchronisation

### Détection des changements

Avant un export, le système compare :

1. **Local → Moodle** : Nœuds modifiés localement depuis le dernier sync (checksum différent)
2. **Moodle → Local** (post-MVP) : Modifications faites directement dans Moodle

### Modes de synchronisation

| Mode | Description | MVP |
|------|-------------|-----|
| **Export** | Pousse les changements locaux vers Moodle | Oui |
| **Import** | Tire la structure Moodle dans le mindmap | Oui |
| **Sync bidirectionnel** | Détecte et fusionne les changements des deux côtés | Non (post-MVP) |

## Critères d'acceptation (MVP)

- [ ] L'utilisateur peut configurer la connexion Moodle (URL + token)
- [ ] La connexion est validée (site info, version, fonctions disponibles)
- [ ] L'export crée un cours dans Moodle avec les sections et modules correspondants
- [ ] L'export met à jour un cours existant (via le mapping)
- [ ] L'import reconstruit le mindmap à partir d'un cours Moodle existant
- [ ] Les erreurs sont affichées clairement avec des suggestions d'action
- [ ] Un rapport d'export détaille les opérations effectuées (créations, mises à jour, erreurs)
- [ ] Le plugin local_kaggu est documenté avec des instructions d'installation
