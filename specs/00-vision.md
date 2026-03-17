# Vision Produit — Kàggu

## Problème

L'interface native de Moodle est puissante mais complexe. Les enseignants passent un temps disproportionné à naviguer dans les menus, configurer les paramètres d'activités et organiser la structure de leurs cours. Cette complexité freine l'adoption et dégrade la qualité pédagogique des parcours créés.

**Constats terrain :**

- La création d'un cours Moodle complet prend en moyenne 8 à 15 heures pour un enseignant non spécialiste
- 70 % des cours Moodle se limitent à un dépôt de fichiers faute de maîtrise des fonctionnalités avancées
- Les formations à Moodle couvrent rarement la conception pédagogique, seulement l'outil

## Solution

**Kàggu** est une plateforme de conception de cours Moodle basée sur un éditeur visuel de type mindmap. L'enseignant conçoit son parcours de formation sous forme d'arbre visuel, puis l'exporte directement vers Moodle via les API Web Services.

Le mindmap sert d'interface d'abstraction : chaque nœud représente un élément Moodle (section, activité, ressource) avec ses propriétés configurables dans un panneau latéral simplifié.

## Public cible

| Segment | Profil | Besoin principal |
|---------|--------|-----------------|
| **Primaire** | Enseignants du supérieur (universités, écoles) | Créer des cours structurés rapidement |
| **Secondaire** | Formateurs en formation professionnelle | Concevoir des parcours personnalisés |
| **Tertiaire** | Ingénieurs pédagogiques | Industrialiser la production de cours |

## Objectifs

1. **Réduire le temps de création** d'un cours Moodle de 60 % par rapport à l'interface native
2. **Améliorer la qualité pédagogique** en guidant la structuration du parcours via la visualisation
3. **Démocratiser les fonctionnalités avancées** de Moodle (achèvement, restrictions, badges) grâce à une interface intuitive
4. **Favoriser le partage** de ressources éducatives libres (OER) entre enseignants

## Périmètre MVP

### Inclus dans le MVP (P0)

- Éditeur mindmap avec les types de nœuds : Cours, Section, Ressource, Activité
- Types de ressources : Fichier, URL, Page
- Types d'activités : Devoir, Quiz, Forum
- Panneau de propriétés contextuel par type de nœud
- Sauvegarde locale des projets de cours (SQLite)
- Connexion à une instance Moodle via token Web Services
- Export du mindmap vers Moodle (création de cours, sections, modules)
- Import d'un cours Moodle existant dans le mindmap

### Post-MVP (P1)

- Parcours personnalisés (achèvement, restrictions, branchements conditionnels)
- Gamification (badges Moodle, OpenBadges)
- Types de ressources supplémentaires : Livre, SCORM, H5P
- Types d'activités supplémentaires : Leçon, Atelier, Wiki, Glossaire

### Post-MVP (P2)

- Personnalisation graphique (theming des cours Moodle)
- Bibliothèque de ressources éducatives libres (OER)
- Intégration LLM (génération de contenu, assistant de conception)
- Collaboration temps réel entre enseignants
- Plugin Moodle local pour les endpoints manquants

## Principes directeurs

1. **Simplicité d'abord** — Chaque fonctionnalité doit réduire la complexité perçue, jamais l'augmenter
2. **Moodle-natif** — L'export produit des cours 100 % compatibles Moodle standard, sans dépendance à Kàggu
3. **Progressivité** — L'outil s'adapte au niveau de l'utilisateur (mode simplifié / mode expert)
4. **Offline-first** — Le mindmap fonctionne sans connexion ; la synchronisation Moodle est une action explicite
