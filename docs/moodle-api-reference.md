# Référence API Moodle Web Services — Kàggu

## Vue d'ensemble

Moodle expose ses fonctionnalités via des **Web Services** (API REST). Chaque appel est une requête HTTP POST vers l'endpoint `/webservice/rest/server.php` avec un token d'authentification.

**URL de base :** `{MOODLE_URL}/webservice/rest/server.php`

**Paramètres communs :**
```
wstoken={TOKEN}
wsfunction={FUNCTION_NAME}
moodlewsrestformat=json
```

**Exemple d'appel :**
```
POST https://moodle.example.com/webservice/rest/server.php
Content-Type: application/x-www-form-urlencoded

wstoken=abc123&wsfunction=core_webservice_get_site_info&moodlewsrestformat=json
```

## Prérequis côté Moodle

### 1. Activer les Web Services

- Administration du site > Fonctionnalités avancées > **Activer les services web** : Oui
- Administration du site > Plugins > Services web > Gérer les protocoles > **REST** : Activer

### 2. Créer un service externe

Administration du site > Plugins > Services web > Services externes > Ajouter

- **Nom** : Kàggu
- **Nom abrégé** : kaggu
- **Activé** : Oui
- **Utilisateurs autorisés** : Ajouter les fonctions listées ci-dessous

### 3. Fonctions à ajouter au service

```
core_webservice_get_site_info
core_course_create_courses
core_course_update_courses
core_course_get_courses
core_course_get_contents
core_course_get_categories
core_enrol_get_users_courses
local_kaggu_create_module
local_kaggu_update_module
local_kaggu_delete_module
local_kaggu_reorder_modules
```

### 4. Créer un token

Administration du site > Plugins > Services web > Gérer les tokens > Ajouter

- **Utilisateur** : Un utilisateur ayant le rôle gestionnaire (ou capabilities ci-dessous)
- **Service** : Kàggu

### 5. Capabilities requises

L'utilisateur associé au token doit avoir les capabilities suivantes :

```
moodle/course:create
moodle/course:update
moodle/course:view
moodle/course:viewhiddencourses
moodle/course:manageactivities
moodle/course:sectionvisibility
moodle/course:movesections
moodle/course:setcurrentsection
moodle/backup:backupcourse
moodle/restore:restorecourse
webservice:createtoken
```

---

## Fonctions API détaillées

### `core_webservice_get_site_info`

Récupère les informations du site Moodle et valide le token.

**Usage Kàggu :** Validation de la connexion, détection de la version Moodle.

**Paramètres d'entrée :** Aucun (le token suffit)

**Réponse :**
```json
{
  "sitename": "Mon Moodle",
  "username": "admin",
  "firstname": "Jean",
  "lastname": "Dupont",
  "fullname": "Jean Dupont",
  "lang": "fr",
  "userid": 2,
  "siteurl": "https://moodle.example.com",
  "userpictureurl": "...",
  "functions": [
    { "name": "core_course_create_courses", "version": "..." },
    ...
  ],
  "downloadfiles": 1,
  "uploadfiles": 1,
  "release": "4.3.2 (Build: 20240108)",
  "version": "2023100900",
  "mobilecssurl": "",
  "advancedfeatures": [...]
}
```

**Points clés :**
- Le champ `functions` liste les fonctions autorisées pour ce token
- Le champ `version` permet de vérifier la compatibilité (≥ 2020061500 pour Moodle 3.9+)

---

### `core_course_create_courses`

Crée un ou plusieurs cours.

**Paramètres d'entrée :**

| Paramètre | Type | Requis | Description |
|-----------|------|--------|-------------|
| `courses[0][fullname]` | string | oui | Nom complet du cours |
| `courses[0][shortname]` | string | oui | Nom abrégé (unique) |
| `courses[0][categoryid]` | int | oui | ID de la catégorie |
| `courses[0][summary]` | string | non | Description HTML |
| `courses[0][summaryformat]` | int | non | 1 = HTML (défaut) |
| `courses[0][format]` | string | non | topics, weeks, social (défaut: topics) |
| `courses[0][numsections]` | int | non | Nombre de sections (défaut: 10) |
| `courses[0][startdate]` | int | non | Timestamp Unix |
| `courses[0][enddate]` | int | non | Timestamp Unix |
| `courses[0][visible]` | int | non | 0 ou 1 (défaut: 1) |
| `courses[0][lang]` | string | non | Code langue (ex: "fr") |

**Réponse :**
```json
[
  {
    "id": 42,
    "shortname": "PQ-L3"
  }
]
```

**Erreurs possibles :**
- `shortnametaken` : Le shortname est déjà utilisé
- `cannotcreatecourse` : Permissions insuffisantes
- `categoryidnumber` : Catégorie inexistante

---

### `core_course_update_courses`

Met à jour un ou plusieurs cours existants.

**Paramètres d'entrée :**

| Paramètre | Type | Requis | Description |
|-----------|------|--------|-------------|
| `courses[0][id]` | int | oui | ID du cours |
| `courses[0][fullname]` | string | non | Nouveau nom complet |
| `courses[0][shortname]` | string | non | Nouveau nom abrégé |
| `courses[0][categoryid]` | int | non | Nouvelle catégorie |
| `courses[0][summary]` | string | non | Nouvelle description |
| `courses[0][format]` | string | non | Nouveau format |
| `courses[0][visible]` | int | non | 0 ou 1 |

**Réponse :**
```json
{
  "warnings": []
}
```

---

### `core_course_get_courses`

Récupère les détails d'un ou plusieurs cours.

**Paramètres d'entrée :**

| Paramètre | Type | Requis | Description |
|-----------|------|--------|-------------|
| `options[ids][]` | int | non | IDs des cours (vide = tous) |

**Réponse :**
```json
[
  {
    "id": 42,
    "shortname": "PQ-L3",
    "fullname": "Physique Quantique L3",
    "categoryid": 5,
    "summary": "<p>...</p>",
    "format": "topics",
    "startdate": 1704067200,
    "enddate": 1719792000,
    "numsections": 10,
    "visible": 1,
    "timecreated": 1704067200,
    "timemodified": 1704153600
  }
]
```

---

### `core_course_get_contents`

Récupère la structure complète d'un cours (sections et modules).

**Paramètres d'entrée :**

| Paramètre | Type | Requis | Description |
|-----------|------|--------|-------------|
| `courseid` | int | oui | ID du cours |

**Réponse :**
```json
[
  {
    "id": 101,
    "name": "Introduction",
    "visible": 1,
    "summary": "<p>Bases de la mécanique quantique</p>",
    "section": 1,
    "modules": [
      {
        "id": 201,
        "name": "Cours magistral - Fondements",
        "modname": "page",
        "modplural": "Pages",
        "visible": 1,
        "instance": 55,
        "url": "https://moodle.example.com/mod/page/view.php?id=201",
        "contents": [
          {
            "type": "file",
            "filename": "content",
            "content": "<p>Contenu de la page...</p>"
          }
        ]
      },
      {
        "id": 202,
        "name": "Quiz - Concepts fondamentaux",
        "modname": "quiz",
        "visible": 1,
        "instance": 30,
        "url": "https://moodle.example.com/mod/quiz/view.php?id=202"
      }
    ]
  },
  {
    "id": 102,
    "name": "Chapitre 2 - Dualité onde-corpuscule",
    "visible": 1,
    "summary": "",
    "section": 2,
    "modules": [...]
  }
]
```

**Points clés :**
- `modname` identifie le type de module (assign, quiz, forum, page, url, resource, etc.)
- `instance` est l'ID de l'instance du module (utilisé pour les appels `mod_*`)
- `id` est le course module ID (cmid)

---

### `core_course_get_categories`

Liste les catégories de cours.

**Paramètres d'entrée :**

| Paramètre | Type | Requis | Description |
|-----------|------|--------|-------------|
| `criteria[0][key]` | string | non | Champ de filtre (name, id, parent, etc.) |
| `criteria[0][value]` | string | non | Valeur du filtre |
| `addsubcategories` | int | non | 1 pour inclure les sous-catégories |

**Réponse :**
```json
[
  {
    "id": 1,
    "name": "Divers",
    "parent": 0,
    "coursecount": 5,
    "visible": 1,
    "path": "/1"
  },
  {
    "id": 5,
    "name": "Sciences",
    "parent": 1,
    "coursecount": 12,
    "visible": 1,
    "path": "/1/5"
  }
]
```

---

### `core_enrol_get_users_courses`

Liste les cours dans lesquels un utilisateur est inscrit.

**Paramètres d'entrée :**

| Paramètre | Type | Requis | Description |
|-----------|------|--------|-------------|
| `userid` | int | oui | ID de l'utilisateur |

**Usage Kàggu :** Afficher la liste des cours existants pour l'import.

---

### `core_completion_get_activities_completion_status` (P1)

Récupère les statuts d'achèvement des activités d'un cours pour un utilisateur.

**Paramètres d'entrée :**

| Paramètre | Type | Requis | Description |
|-----------|------|--------|-------------|
| `courseid` | int | oui | ID du cours |
| `userid` | int | oui | ID de l'utilisateur |

---

### `core_group_create_groups` (P1)

Crée des groupes dans un cours.

**Paramètres d'entrée :**

| Paramètre | Type | Requis | Description |
|-----------|------|--------|-------------|
| `groups[0][courseid]` | int | oui | ID du cours |
| `groups[0][name]` | string | oui | Nom du groupe |
| `groups[0][description]` | string | non | Description |

---

## Plugin local_kaggu — Fonctions exposées

Le plugin local `local_kaggu` est **nécessaire** pour le MVP car Moodle ne fournit pas de fonctions Web Services pour créer des instances de modules (activités/ressources).

### `local_kaggu_create_module`

Crée un module (activité ou ressource) dans une section d'un cours.

**Paramètres d'entrée :**

| Paramètre | Type | Requis | Description |
|-----------|------|--------|-------------|
| `courseid` | int | oui | ID du cours |
| `sectionnum` | int | oui | Numéro de la section (0-based) |
| `moduletype` | string | oui | Type : assign, quiz, forum, page, url, resource |
| `name` | string | oui | Nom du module |
| `intro` | string | non | Description HTML |
| `introformat` | int | non | 1 = HTML |
| `visible` | int | non | 0 ou 1 |
| `options` | string (JSON) | non | Options spécifiques au type de module |

**Options par type de module :**

**assign :**
```json
{
  "duedate": 1710288000,
  "cutoffdate": 1710374400,
  "grade": 20,
  "submissiontype": "file"
}
```

**quiz :**
```json
{
  "timeopen": 1710288000,
  "timeclose": 1710374400,
  "timelimit": 1800,
  "attempts": 2,
  "grademethod": 1
}
```

**forum :**
```json
{
  "type": "general",
  "maxattachments": 3
}
```

**url :**
```json
{
  "externalurl": "https://example.com",
  "display": 0
}
```

**page :**
```json
{
  "content": "<p>Contenu de la page</p>",
  "contentformat": 1
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

### `local_kaggu_update_module`

Met à jour un module existant.

**Paramètres d'entrée :**

| Paramètre | Type | Requis | Description |
|-----------|------|--------|-------------|
| `cmid` | int | oui | Course module ID |
| `name` | string | non | Nouveau nom |
| `intro` | string | non | Nouvelle description |
| `visible` | int | non | 0 ou 1 |
| `options` | string (JSON) | non | Options mises à jour |

### `local_kaggu_delete_module`

Supprime un module.

**Paramètres d'entrée :**

| Paramètre | Type | Requis | Description |
|-----------|------|--------|-------------|
| `cmid` | int | oui | Course module ID |

### `local_kaggu_reorder_modules`

Réordonne les modules dans une section.

**Paramètres d'entrée :**

| Paramètre | Type | Requis | Description |
|-----------|------|--------|-------------|
| `sectionid` | int | oui | ID de la section |
| `cmids` | string | oui | IDs des modules séparés par des virgules, dans l'ordre souhaité |

---

## Limitations connues

### API Moodle natives

1. **Pas de création de modules** : Les fonctions `mod_*` ne permettent pas de créer des instances. Le plugin `local_kaggu` est obligatoire.
2. **Pas de gestion des sections** : Il n'existe pas de fonction dédiée pour créer/supprimer des sections. On utilise `core_course_update_courses` avec le paramètre `numsections` et les mises à jour de métadonnées.
3. **Upload de fichiers** : L'upload de fichiers (pour les ressources de type Fichier) nécessite un appel séparé via `core_files_upload` ou le plugin local.
4. **Questions de quiz** : Les fonctions de gestion de la banque de questions existent (`core_question_*`) mais sont complexes. Le MVP ne gère pas les questions — elles seront créées dans Moodle.
5. **Badges** : Les fonctions `core_badges_*` sont limitées en lecture. La création de badges nécessite le plugin local.
6. **Rate limiting** : Moodle n'a pas de rate limiting natif mais peut bloquer les IPs via `fail2ban` ou configuration serveur. Espacer les appels (100ms entre chaque) est recommandé.

### Compatibilité versions

| Version Moodle | Support |
|---------------|---------|
| 4.x (≥ 4.0) | Complet |
| 3.11 | Complet |
| 3.9 – 3.10 | Partiel (certaines fonctions manquantes) |
| < 3.9 | Non supporté |

### Taille des payloads

- **Limite côté Moodle** : `max_input_vars` dans php.ini (défaut: 1000). Pour les cours avec beaucoup de modules, cette limite peut être atteinte → recommander `max_input_vars = 5000`.
- **Timeout** : `max_execution_time` dans php.ini. Pour les exports longs → traitement séquentiel avec pauses.
