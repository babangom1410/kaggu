# Bibliothèque OER — Kàggu (Post-MVP, P2)

## Contexte

Les Ressources Éducatives Libres (OER — Open Educational Resources) sont des contenus pédagogiques sous licence ouverte. Kàggu intègre un catalogue de recherche OER permettant d'enrichir les cours sans créer tout le contenu de zéro.

## Fonctionnalités

### Recherche OER (P2)

Panneau latéral ou modal de recherche avec :

| Filtre | Options |
|--------|---------|
| Mots-clés | Recherche textuelle libre |
| Discipline | Sciences, Lettres, Informatique, Santé, etc. |
| Niveau | Licence, Master, Formation pro |
| Format | Document, Vidéo, Image, Interactif (H5P), Cours complet |
| Licence | CC-BY, CC-BY-SA, CC-BY-NC, Domaine public |
| Langue | FR, EN, ES, etc. |

### Sources OER

| Source | API | Type de contenu |
|--------|-----|----------------|
| OER Commons | REST API | Cours, documents, activités |
| Wikimedia Commons | MediaWiki API | Images, vidéos, audio |
| OpenStax | REST API | Manuels (sciences, maths) |
| MIT OpenCourseWare | Scraping / RSS | Cours complets |
| MERLOT | REST API | Ressources pédagogiques variées |

### Import dans le mindmap (P2)

- Drag & drop depuis les résultats de recherche vers une section du mindmap
- Création automatique du nœud correspondant (URL, Page, ou Fichier selon le format)
- Métadonnées OER conservées (auteur, licence, source)

### Favoris et collections (P2)

- Sauvegarder des ressources OER en favoris
- Créer des collections thématiques réutilisables entre projets

## Règles métier

- Les métadonnées de licence doivent être préservées et affichées
- Les ressources OER sont référencées par URL (pas de copie locale sauf fichiers téléchargeables)
- Le respect des licences est de la responsabilité de l'enseignant (Kàggu affiche un rappel)

## Critères d'acceptation

- [ ] L'enseignant peut rechercher des ressources OER par mots-clés et filtres
- [ ] Les résultats affichent un aperçu (titre, description, licence, source)
- [ ] L'enseignant peut glisser-déposer une ressource OER dans le mindmap
- [ ] Le nœud créé contient les métadonnées de la ressource
- [ ] La licence est affichée sur le nœud dans le mindmap
