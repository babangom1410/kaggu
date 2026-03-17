# Personnalisation Graphique — Kàggu (Post-MVP, P2)

## Contexte

Les cours Moodle ont souvent un aspect uniforme et peu engageant. Kàggu permet de personnaliser l'apparence du cours en configurant des éléments visuels qui seront appliqués lors de l'export.

## Fonctionnalités

### Templates de cours (P2)

Modèles prédéfinis de mise en page pour les sections Moodle :

| Template | Description |
|----------|-------------|
| **Classique** | Sections empilées verticalement, icônes par type d'activité |
| **Cartes** | Sections en grille de cartes avec image de couverture |
| **Timeline** | Sections organisées chronologiquement |
| **Onglets** | Sections en onglets horizontaux |

**Implémentation :** Les templates injectent du CSS et du HTML personnalisé via le champ `summary` des sections et les labels Moodle.

### Palette de couleurs (P2)

| Propriété | Description |
|-----------|-------------|
| Couleur primaire | Appliquée aux titres de sections |
| Couleur secondaire | Appliquée aux boutons et liens |
| Couleur de fond | Fond des sections |
| Police | Choix parmi une sélection de polices web-safe |

### Bannières (P2)

- Image de bannière pour le cours (header)
- Images de couverture par section
- Upload ou sélection depuis une banque d'images libres

### Prévisualisation (P2)

Panneau de prévisualisation montrant un aperçu du rendu Moodle avec le template et les couleurs choisis, sans quitter l'éditeur mindmap.

## Règles métier

- Le theming ne modifie pas la structure du cours, seulement l'apparence
- Les templates doivent être compatibles avec le thème Moodle Boost (thème par défaut)
- Les personnalisations sont stockées dans le projet et appliquées à chaque export

## Critères d'acceptation

- [ ] L'enseignant peut choisir un template de cours
- [ ] L'enseignant peut personnaliser les couleurs et polices
- [ ] L'enseignant peut ajouter des images de bannière
- [ ] La prévisualisation reflète fidèlement le rendu Moodle
- [ ] L'export applique le theming via HTML/CSS dans les champs Moodle
