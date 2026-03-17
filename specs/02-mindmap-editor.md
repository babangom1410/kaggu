# Éditeur Mindmap — Kàggu

## Contexte

L'éditeur mindmap est le cœur de Kàggu. Il permet à l'enseignant de concevoir visuellement la structure de son cours Moodle sous forme d'arbre de nœuds interconnectés. Chaque nœud correspond à un élément Moodle (cours, section, ressource, activité).

**Technologie** : ReactFlow 11+ avec des nœuds personnalisés (custom nodes).

## Acteurs

- **Enseignant** : crée et édite le mindmap
- **Système** : sauvegarde automatique, validation de la structure

## Types de nœuds

### Nœud Cours (racine)

| Propriété | Type | Requis | Mapping Moodle |
|-----------|------|--------|----------------|
| `fullname` | string | oui | `fullname` |
| `shortname` | string | oui | `shortname` |
| `summary` | richtext | non | `summary` |
| `format` | enum: topics, weeks, social | oui | `format` |
| `startdate` | date | non | `startdate` |
| `enddate` | date | non | `enddate` |
| `visible` | boolean | oui | `visible` |
| `category` | number | oui | `categoryid` |

**Règles :**
- Un seul nœud cours par projet (racine de l'arbre)
- Ne peut pas être supprimé
- Ses enfants directs sont exclusivement des nœuds Section

**Apparence :** Rectangle arrondi, couleur primaire (bleu), icône 🎓, taille large.

### Nœud Section

| Propriété | Type | Requis | Mapping Moodle |
|-----------|------|--------|----------------|
| `name` | string | oui | `name` |
| `summary` | richtext | non | `summary` |
| `visible` | boolean | oui | `visible` |
| `position` | number | auto | ordre dans le cours |

**Règles :**
- Parent obligatoire : nœud Cours
- Enfants possibles : nœuds Ressource, Activité
- Ordre des sections déterminé par la position verticale dans le mindmap

**Apparence :** Rectangle, couleur secondaire (vert), icône 📂.

### Nœuds Ressource

Sous-types de ressources disponibles :

#### Fichier (P0 — MVP)

| Propriété | Type | Requis | Mapping Moodle |
|-----------|------|--------|----------------|
| `name` | string | oui | `name` |
| `description` | richtext | non | `intro` |
| `file` | file upload | oui | fichier uploadé via API |
| `visible` | boolean | oui | `visible` |

**Module Moodle :** `mod_resource`

#### URL (P0 — MVP)

| Propriété | Type | Requis | Mapping Moodle |
|-----------|------|--------|----------------|
| `name` | string | oui | `name` |
| `description` | richtext | non | `intro` |
| `url` | url | oui | `externalurl` |
| `display` | enum: auto, embed, open, popup | non | `display` |
| `visible` | boolean | oui | `visible` |

**Module Moodle :** `mod_url`

#### Page (P0 — MVP)

| Propriété | Type | Requis | Mapping Moodle |
|-----------|------|--------|----------------|
| `name` | string | oui | `name` |
| `description` | richtext | non | `intro` |
| `content` | richtext | oui | `content` |
| `visible` | boolean | oui | `visible` |

**Module Moodle :** `mod_page`

#### Livre (P1 — post-MVP)

| Propriété | Type | Requis | Mapping Moodle |
|-----------|------|--------|----------------|
| `name` | string | oui | `name` |
| `description` | richtext | non | `intro` |
| `chapters` | array | oui | chapitres du livre |
| `visible` | boolean | oui | `visible` |

**Module Moodle :** `mod_book`

#### SCORM (P1 — post-MVP)

| Propriété | Type | Requis | Mapping Moodle |
|-----------|------|--------|----------------|
| `name` | string | oui | `name` |
| `description` | richtext | non | `intro` |
| `package` | file upload (.zip) | oui | paquet SCORM |
| `visible` | boolean | oui | `visible` |

**Module Moodle :** `mod_scorm`

#### H5P (P1 — post-MVP)

| Propriété | Type | Requis | Mapping Moodle |
|-----------|------|--------|----------------|
| `name` | string | oui | `name` |
| `description` | richtext | non | `intro` |
| `package` | file upload (.h5p) | oui | paquet H5P |
| `visible` | boolean | oui | `visible` |

**Module Moodle :** `mod_h5pactivity`

**Apparence commune :** Rectangle arrondi, couleur ressource (orange), icône spécifique par sous-type.

### Nœuds Activité

#### Devoir (P0 — MVP)

| Propriété | Type | Requis | Mapping Moodle |
|-----------|------|--------|----------------|
| `name` | string | oui | `name` |
| `description` | richtext | non | `intro` |
| `duedate` | datetime | non | `duedate` |
| `cutoffdate` | datetime | non | `cutoffdate` |
| `maxgrade` | number | oui | `grade` |
| `submissiontype` | enum: online_text, file, both | oui | `assignsubmission_*` |
| `visible` | boolean | oui | `visible` |

**Module Moodle :** `mod_assign`

#### Quiz (P0 — MVP)

| Propriété | Type | Requis | Mapping Moodle |
|-----------|------|--------|----------------|
| `name` | string | oui | `name` |
| `description` | richtext | non | `intro` |
| `timeopen` | datetime | non | `timeopen` |
| `timeclose` | datetime | non | `timeclose` |
| `timelimit` | number (secondes) | non | `timelimit` |
| `attempts` | number | non | `attempts` |
| `grademethod` | enum: highest, average, first, last | non | `grademethod` |
| `visible` | boolean | oui | `visible` |

**Module Moodle :** `mod_quiz`

> **Note :** La gestion des questions de quiz (banque de questions) est complexe et sera traitée dans une itération dédiée. Le MVP permet de créer le conteneur Quiz ; les questions seront ajoutées dans Moodle.

#### Forum (P0 — MVP)

| Propriété | Type | Requis | Mapping Moodle |
|-----------|------|--------|----------------|
| `name` | string | oui | `name` |
| `description` | richtext | non | `intro` |
| `type` | enum: general, single, qanda, blog, eachuser | oui | `type` |
| `maxattachments` | number | non | `maxattachments` |
| `visible` | boolean | oui | `visible` |

**Module Moodle :** `mod_forum`

#### Leçon (P1)

| Propriété | Type | Requis | Mapping Moodle |
|-----------|------|--------|----------------|
| `name` | string | oui | `name` |
| `description` | richtext | non | `intro` |
| `visible` | boolean | oui | `visible` |

**Module Moodle :** `mod_lesson`

#### Atelier (P1)

| Propriété | Type | Requis | Mapping Moodle |
|-----------|------|--------|----------------|
| `name` | string | oui | `name` |
| `description` | richtext | non | `intro` |
| `visible` | boolean | oui | `visible` |

**Module Moodle :** `mod_workshop`

#### Wiki (P1)

| Propriété | Type | Requis | Mapping Moodle |
|-----------|------|--------|----------------|
| `name` | string | oui | `name` |
| `description` | richtext | non | `intro` |
| `wikimode` | enum: collaborative, individual | oui | `wikimode` |
| `visible` | boolean | oui | `visible` |

**Module Moodle :** `mod_wiki`

#### Glossaire (P1)

| Propriété | Type | Requis | Mapping Moodle |
|-----------|------|--------|----------------|
| `name` | string | oui | `name` |
| `description` | richtext | non | `intro` |
| `visible` | boolean | oui | `visible` |

**Module Moodle :** `mod_glossary`

**Apparence commune :** Rectangle arrondi, couleur activité (violet), icône spécifique par sous-type.

### Nœud Branchement (P2 — post-MVP)

| Propriété | Type | Requis | Mapping Moodle |
|-----------|------|--------|----------------|
| `condition_type` | enum: completion, grade, group, date | oui | `availability` JSON |
| `condition_value` | dynamic | oui | selon le type |
| `label` | string | non | — |

**Règles :**
- Deux sorties : branche "vrai" et branche "faux"
- Traduit en restrictions d'accès Moodle (`availability` conditions)

**Apparence :** Losange, couleur conditionnelle (jaune), icône ⑂.

## Interactions utilisateur

### Canvas (zone de dessin)

| Interaction | Comportement |
|-------------|-------------|
| **Pan** | Clic molette + drag, ou trackpad deux doigts |
| **Zoom** | Molette scroll, ou boutons +/- dans le toolbar |
| **Minimap** | Panneau réduit en bas à droite montrant la vue d'ensemble |
| **Fit view** | Bouton pour recadrer sur tout le mindmap |
| **Grille** | Snap-to-grid optionnel pour aligner les nœuds |

### Nœuds

| Interaction | Comportement |
|-------------|-------------|
| **Ajouter** | Clic droit sur un nœud parent → menu contextuel avec les types enfants autorisés |
| **Sélectionner** | Clic sur un nœud → ouvre le panneau de propriétés |
| **Multi-sélection** | Shift + clic, ou rectangle de sélection (lasso) |
| **Déplacer** | Drag & drop (individuel ou groupe) |
| **Supprimer** | Touche Suppr ou bouton dans le panneau, avec confirmation |
| **Dupliquer** | Ctrl/Cmd + D sur un nœud sélectionné (copie le nœud et ses enfants) |
| **Connecter** | Drag depuis le handle de sortie d'un nœud vers le handle d'entrée d'un autre |

### Arêtes (connexions)

| Interaction | Comportement |
|-------------|-------------|
| **Créer** | Drag entre handles de nœuds |
| **Supprimer** | Clic sur l'arête → touche Suppr |
| **Style** | Arête directe (straight) pour les liens section→module, arête courbe (bezier) pour les branchements |

### Raccourcis clavier

| Raccourci | Action |
|-----------|--------|
| `Ctrl/Cmd + S` | Sauvegarde manuelle |
| `Ctrl/Cmd + Z` | Annuler |
| `Ctrl/Cmd + Shift + Z` | Rétablir |
| `Ctrl/Cmd + D` | Dupliquer la sélection |
| `Ctrl/Cmd + A` | Tout sélectionner |
| `Delete / Backspace` | Supprimer la sélection |
| `Ctrl/Cmd + +/-` | Zoom in/out |
| `Ctrl/Cmd + 0` | Fit view |

## Panneau de propriétés

Le panneau de propriétés est un panneau latéral droit qui affiche un formulaire contextuel selon le type de nœud sélectionné.

**Comportement :**
- S'ouvre à la sélection d'un nœud
- Se ferme au clic sur le canvas (zone vide)
- Les modifications sont appliquées en temps réel (pas de bouton "Sauvegarder")
- Largeur : 360px, redimensionnable
- Scrollable si le formulaire dépasse la hauteur

**Composants du formulaire :**
- Champs texte, nombre, date, URL
- Éditeur richtext simplifié (gras, italique, listes, liens) pour les descriptions
- Sélecteurs (dropdown) pour les enums
- Upload de fichier (drag & drop zone)
- Toggle pour les booléens (visible, etc.)

## Toolbar

Barre d'outils horizontale en haut du canvas :

| Élément | Description |
|---------|-------------|
| Nom du projet | Éditable inline |
| Bouton "Ajouter section" | Ajoute un nœud Section enfant du cours |
| Undo / Redo | Historique des actions |
| Zoom controls | Zoom in, zoom out, fit view |
| Bouton "Export Moodle" | Lance la synchronisation vers Moodle |
| Bouton "Importer" | Import depuis Moodle ou fichier JSON |
| Bouton "Paramètres" | Configuration de la connexion Moodle |

## Sauvegarde

### Sauvegarde automatique

- Toutes les 30 secondes si des modifications ont eu lieu
- Indicateur visuel : "Sauvegardé" (vert) / "Sauvegarde en cours..." (gris) / "Non sauvegardé" (orange)
- Debounce : 2 secondes après la dernière modification avant de déclencher la sauvegarde

### Format de données

Le mindmap est stocké en JSON :

```json
{
  "id": "project-uuid",
  "name": "Mon cours de physique",
  "createdAt": "2026-01-15T10:00:00Z",
  "updatedAt": "2026-01-15T14:30:00Z",
  "moodleConfig": {
    "url": "https://moodle.example.com",
    "courseId": null
  },
  "nodes": [
    {
      "id": "node-1",
      "type": "course",
      "position": { "x": 400, "y": 100 },
      "data": {
        "fullname": "Physique Quantique L3",
        "shortname": "PQ-L3",
        "format": "topics",
        "visible": true,
        "category": 5
      }
    },
    {
      "id": "node-2",
      "type": "section",
      "position": { "x": 200, "y": 300 },
      "data": {
        "name": "Introduction",
        "summary": "<p>Bases de la mécanique quantique</p>",
        "visible": true
      }
    },
    {
      "id": "node-3",
      "type": "activity-quiz",
      "position": { "x": 100, "y": 500 },
      "data": {
        "name": "Quiz - Concepts fondamentaux",
        "timelimit": 1800,
        "attempts": 2,
        "visible": true
      }
    }
  ],
  "edges": [
    { "id": "edge-1", "source": "node-1", "target": "node-2" },
    { "id": "edge-2", "source": "node-2", "target": "node-3" }
  ]
}
```

### Import / Export JSON

- **Export** : Téléchargement du fichier JSON du projet (pour sauvegarde externe ou partage)
- **Import** : Upload d'un fichier JSON pour restaurer un projet

## Validation

### Règles de validation structurelle

| Règle | Sévérité | Message |
|-------|----------|---------|
| Un seul nœud cours (racine) | erreur | "Le projet doit avoir exactement un nœud cours" |
| Sections connectées au cours | erreur | "La section '{name}' doit être connectée au cours" |
| Modules connectés à une section | erreur | "Le module '{name}' doit être connecté à une section" |
| Pas de cycles dans l'arbre | erreur | "Structure cyclique détectée" |
| Champs requis remplis | avertissement | "Le champ '{field}' est requis pour '{name}'" |
| Noms uniques par section | avertissement | "Nom dupliqué dans la section '{section}'" |

### Validation avant export

Avant l'export vers Moodle, une validation complète est exécutée. Les erreurs bloquent l'export ; les avertissements affichent une confirmation.

## Critères d'acceptation (MVP)

- [ ] L'utilisateur peut créer un projet et voir un nœud cours (racine) par défaut
- [ ] L'utilisateur peut ajouter des nœuds Section, Fichier, URL, Page, Devoir, Quiz, Forum
- [ ] Les nœuds sont connectés par des arêtes représentant la hiérarchie
- [ ] Le panneau de propriétés affiche le formulaire correspondant au type de nœud sélectionné
- [ ] Le drag & drop déplace les nœuds et préserve les connexions
- [ ] La minimap affiche une vue d'ensemble
- [ ] La sauvegarde automatique fonctionne (indicateur visuel)
- [ ] L'export/import JSON fonctionne
- [ ] Les raccourcis clavier fonctionnent (undo, redo, supprimer, dupliquer)
- [ ] La validation structurelle signale les erreurs avant export
