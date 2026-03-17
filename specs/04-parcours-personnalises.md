# Parcours Personnalisés — Kàggu (Post-MVP, P1)

## Contexte

Les parcours personnalisés permettent de créer des chemins d'apprentissage adaptatifs dans Moodle. L'enseignant définit des conditions d'achèvement et des restrictions d'accès qui guident la progression de l'étudiant.

## Acteurs

- **Enseignant** : configure les conditions et branchements
- **Étudiant** (utilisateur final Moodle) : suit le parcours personnalisé

## Fonctionnalités

### Achèvement d'activité (P1)

Configuration dans le panneau de propriétés de chaque nœud activité/ressource :

| Option | Valeurs | Mapping Moodle |
|--------|---------|----------------|
| Mode d'achèvement | Aucun, Manuel, Automatique | `completion` (0, 1, 2) |
| Condition : vue | oui/non | `completionview` |
| Condition : note minimale | nombre | `completionusegrade` + `completionpassgrade` |
| Condition : soumission | oui/non (devoirs) | `completionsubmit` |

**Visualisation mindmap :** Icône sur le nœud indiquant le mode d'achèvement (✓ manuel, ⚡ auto).

### Restrictions d'accès (P1)

Conditions pour accéder à un module. Configurables dans le panneau de propriétés :

| Type de restriction | Configuration | Mapping Moodle (`availability` JSON) |
|--------------------|---------------|--------------------------------------|
| Achèvement d'activité | Sélectionner un nœud + état (terminé/non terminé) | `{"type":"completion","cm":X,"e":1}` |
| Note | Sélectionner un nœud + note min/max | `{"type":"grade","id":X,"min":Y}` |
| Date | Date de début / fin | `{"type":"date","d":">=","t":TIMESTAMP}` |
| Groupe | Appartenance à un groupe | `{"type":"group","id":X}` |

**Visualisation mindmap :** Arêtes en pointillé avec icône cadenas entre le nœud prérequis et le nœud restreint.

### Groupes et groupements (P1)

| Fonctionnalité | Description |
|---------------|-------------|
| Créer des groupes | Via l'API `core_group_create_groups` |
| Affecter des restrictions par groupe | Condition de type "groupe" sur les modules |
| Groupements | Regrouper des groupes pour appliquer des restrictions à un ensemble |

### Nœuds de branchement (P1)

Nœud spécial en forme de losange avec deux sorties :

- **Condition** : achèvement, note, groupe
- **Branche "vrai"** : chemin si la condition est remplie
- **Branche "faux"** : chemin alternatif

**Traduction Moodle :** Les modules de la branche "vrai" ont une restriction positive, ceux de la branche "faux" ont la restriction inverse (opérateur NOT).

## Règles métier

- Un module peut avoir plusieurs restrictions combinées (ET/OU)
- Les restrictions circulaires sont interdites (A requiert B qui requiert A)
- L'achèvement doit être activé au niveau du cours pour fonctionner

## Critères d'acceptation

- [ ] L'enseignant peut configurer l'achèvement pour chaque activité
- [ ] L'enseignant peut ajouter des restrictions d'accès sur un module
- [ ] Les restrictions sont visualisées sur le mindmap (arêtes conditionnelles)
- [ ] Le nœud branchement propose deux chemins alternatifs
- [ ] L'export traduit correctement les conditions en JSON `availability` Moodle
- [ ] La validation détecte les restrictions circulaires
