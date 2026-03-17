# User Stories — Kàggu

## Format

> En tant que **[rôle]**, je veux **[action]** afin de **[bénéfice]**.

## Priorisation MoSCoW

- **Must** (P0) : Indispensable pour le MVP
- **Should** (P1) : Important, prévu pour la version suivante
- **Could** (P2) : Souhaitable si le temps le permet
- **Won't** : Hors périmètre actuel

---

## Gestion de projet

### US-01 — Créer un projet (Must)

> En tant qu'enseignant, je veux créer un nouveau projet de cours afin de commencer la conception de mon parcours.

**Critères d'acceptation :**
- [ ] Un bouton "Nouveau projet" est disponible sur la page d'accueil
- [ ] Le projet est créé avec un nœud cours (racine) par défaut
- [ ] Le mindmap s'ouvre immédiatement après la création
- [ ] Le projet reçoit un nom par défaut ("Nouveau cours") éditable

### US-02 — Lister mes projets (Must)

> En tant qu'enseignant, je veux voir la liste de mes projets afin de retrouver et reprendre mon travail.

**Critères d'acceptation :**
- [ ] La page d'accueil affiche les projets triés par date de modification (plus récent d'abord)
- [ ] Chaque carte projet affiche : nom, date de dernière modification, statut de sync Moodle
- [ ] Un projet peut être ouvert d'un clic

### US-03 — Supprimer un projet (Must)

> En tant qu'enseignant, je veux supprimer un projet afin de nettoyer ma liste.

**Critères d'acceptation :**
- [ ] Confirmation requise avant suppression
- [ ] La suppression ne touche pas le cours Moodle (si exporté)
- [ ] Le projet est supprimé de la base locale

### US-04 — Sauvegarder automatiquement (Must)

> En tant qu'enseignant, je veux que mon travail soit sauvegardé automatiquement afin de ne pas perdre mes modifications.

**Critères d'acceptation :**
- [ ] Sauvegarde automatique toutes les 30 secondes (si modifications)
- [ ] Indicateur visuel du statut de sauvegarde (sauvegardé / en cours / non sauvegardé)
- [ ] Sauvegarde manuelle via Ctrl/Cmd + S

---

## Éditeur Mindmap

### US-10 — Ajouter une section (Must)

> En tant qu'enseignant, je veux ajouter des sections à mon cours afin de structurer le contenu en chapitres/thèmes.

**Critères d'acceptation :**
- [ ] Clic droit sur le nœud cours → option "Ajouter une section"
- [ ] La section apparaît connectée au cours
- [ ] Le panneau de propriétés s'ouvre pour saisir le nom

### US-11 — Ajouter une ressource (Must)

> En tant qu'enseignant, je veux ajouter des ressources (fichier, URL, page) à une section afin de fournir du contenu aux étudiants.

**Critères d'acceptation :**
- [ ] Clic droit sur un nœud section → menu avec les types de ressources MVP (Fichier, URL, Page)
- [ ] Le nœud apparaît connecté à la section
- [ ] Le panneau de propriétés affiche le formulaire correspondant au type choisi

### US-12 — Ajouter une activité (Must)

> En tant qu'enseignant, je veux ajouter des activités (devoir, quiz, forum) à une section afin de créer des exercices et des interactions.

**Critères d'acceptation :**
- [ ] Clic droit sur un nœud section → menu avec les types d'activités MVP (Devoir, Quiz, Forum)
- [ ] Le nœud apparaît connecté à la section
- [ ] Le panneau de propriétés affiche le formulaire correspondant au type choisi

### US-13 — Configurer un nœud (Must)

> En tant qu'enseignant, je veux configurer les propriétés d'un nœud afin de paramétrer l'élément Moodle correspondant.

**Critères d'acceptation :**
- [ ] Un clic sur un nœud ouvre le panneau de propriétés
- [ ] Le formulaire affiche les champs correspondant au type de nœud
- [ ] Les modifications sont appliquées en temps réel
- [ ] Les champs requis sont marqués
- [ ] La validation inline signale les erreurs de saisie

### US-14 — Déplacer des nœuds (Must)

> En tant qu'enseignant, je veux déplacer les nœuds par drag & drop afin d'organiser visuellement mon parcours.

**Critères d'acceptation :**
- [ ] Drag & drop fluide sur un nœud individuel
- [ ] Les arêtes suivent le déplacement du nœud
- [ ] Multi-sélection + déplacement groupé fonctionne

### US-15 — Supprimer un nœud (Must)

> En tant qu'enseignant, je veux supprimer un nœud afin de retirer un élément de mon cours.

**Critères d'acceptation :**
- [ ] Sélection + touche Suppr → confirmation
- [ ] La suppression d'un nœud section propose de supprimer ou détacher ses enfants
- [ ] Les arêtes connectées sont supprimées

### US-16 — Annuler / Rétablir (Must)

> En tant qu'enseignant, je veux annuler et rétablir mes actions afin de corriger mes erreurs.

**Critères d'acceptation :**
- [ ] Ctrl/Cmd + Z annule la dernière action
- [ ] Ctrl/Cmd + Shift + Z rétablit l'action annulée
- [ ] L'historique supporte au moins 50 actions

### US-17 — Naviguer dans le mindmap (Must)

> En tant qu'enseignant, je veux zoomer, dézoomer et me déplacer afin de travailler sur des cours complexes.

**Critères d'acceptation :**
- [ ] Zoom via molette et boutons +/-
- [ ] Pan via clic molette + drag ou trackpad
- [ ] Minimap affichée en bas à droite
- [ ] Bouton "Fit view" recadre sur tout le mindmap

### US-18 — Dupliquer un nœud (Should)

> En tant qu'enseignant, je veux dupliquer un nœud (et ses enfants) afin de réutiliser une structure existante.

**Critères d'acceptation :**
- [ ] Ctrl/Cmd + D duplique le nœud sélectionné et ses enfants
- [ ] Le nœud dupliqué est placé à côté de l'original
- [ ] Les noms sont suffixés " (copie)"

### US-19 — Exporter/Importer JSON (Should)

> En tant qu'enseignant, je veux exporter mon mindmap en JSON et l'importer afin de sauvegarder ou partager mon travail.

**Critères d'acceptation :**
- [ ] Bouton "Exporter JSON" télécharge le fichier
- [ ] Bouton "Importer JSON" permet de charger un fichier
- [ ] L'import restaure l'intégralité du mindmap (nœuds, arêtes, positions, propriétés)

---

## Intégration Moodle

### US-20 — Configurer la connexion Moodle (Must)

> En tant qu'enseignant, je veux configurer la connexion à mon instance Moodle afin de pouvoir exporter mes cours.

**Critères d'acceptation :**
- [ ] Formulaire : URL Moodle + Token
- [ ] Bouton "Tester la connexion" vérifie le token
- [ ] Affichage du nom du site et de la version Moodle si succès
- [ ] Message d'erreur clair si échec (token invalide, URL incorrecte, WS désactivés)

### US-21 — Exporter vers Moodle (Must)

> En tant qu'enseignant, je veux exporter mon mindmap vers Moodle afin de créer le cours dans ma plateforme.

**Critères d'acceptation :**
- [ ] Bouton "Exporter vers Moodle" dans la toolbar
- [ ] Validation du mindmap avant export (erreurs bloquantes affichées)
- [ ] Barre de progression pendant l'export
- [ ] Rapport final : modules créés, mis à jour, erreurs
- [ ] Lien direct vers le cours Moodle créé

### US-22 — Mettre à jour un cours Moodle (Must)

> En tant qu'enseignant, je veux re-exporter mon mindmap afin de synchroniser les modifications vers Moodle.

**Critères d'acceptation :**
- [ ] Si le cours a déjà été exporté, l'export met à jour (pas de duplication)
- [ ] Les modules ajoutés sont créés, les modules modifiés sont mis à jour
- [ ] Les modules supprimés du mindmap ne sont pas supprimés de Moodle (sécurité) — avertissement affiché

### US-23 — Importer un cours Moodle (Must)

> En tant qu'enseignant, je veux importer un cours Moodle existant afin de le visualiser et le modifier dans le mindmap.

**Critères d'acceptation :**
- [ ] Saisir l'ID ou l'URL du cours Moodle
- [ ] Le mindmap est généré automatiquement avec la structure du cours
- [ ] Le layout en arbre est calculé automatiquement
- [ ] Le mapping est créé pour permettre des exports ultérieurs

---

## Authentification

### US-30 — Créer un compte (Must)

> En tant qu'enseignant, je veux créer un compte afin d'accéder à Kàggu.

**Critères d'acceptation :**
- [ ] Formulaire : email + mot de passe (+ confirmation)
- [ ] Validation email (format) et mot de passe (8 caractères min)
- [ ] Redirection vers la page projets après inscription

### US-31 — Se connecter (Must)

> En tant qu'enseignant, je veux me connecter afin de retrouver mes projets.

**Critères d'acceptation :**
- [ ] Formulaire : email + mot de passe
- [ ] Message d'erreur si identifiants incorrects
- [ ] Session persistante (JWT, durée 7 jours)

### US-32 — Se déconnecter (Must)

> En tant qu'enseignant, je veux me déconnecter afin de sécuriser mon compte.

**Critères d'acceptation :**
- [ ] Bouton de déconnexion dans le header
- [ ] Redirection vers la page de connexion

---

## Post-MVP — Parcours personnalisés (Should)

### US-40 — Configurer l'achèvement d'activité (Should)

> En tant qu'enseignant, je veux configurer les critères d'achèvement d'une activité afin de suivre la progression des étudiants.

**Critères d'acceptation :**
- [ ] Option d'achèvement dans le panneau de propriétés (manuel, automatique, conditions)
- [ ] Visualisation de l'achèvement sur le nœud (icône)

### US-41 — Configurer des restrictions d'accès (Should)

> En tant qu'enseignant, je veux restreindre l'accès à un module selon des conditions afin de créer des parcours progressifs.

**Critères d'acceptation :**
- [ ] Conditions : achèvement d'une autre activité, note minimale, appartenance à un groupe, date
- [ ] Visualisation des restrictions sur les arêtes du mindmap

### US-42 — Créer un branchement conditionnel (Should)

> En tant qu'enseignant, je veux créer un nœud de branchement afin de proposer des chemins différents selon les résultats de l'étudiant.

**Critères d'acceptation :**
- [ ] Nœud losange avec deux sorties (vrai/faux)
- [ ] Configuration de la condition dans le panneau de propriétés
- [ ] Traduit en restrictions d'accès Moodle à l'export

---

## Post-MVP — Gamification (Could)

### US-50 — Créer un badge (Could)

> En tant qu'enseignant, je veux créer des badges afin de récompenser les étudiants.

**Critères d'acceptation :**
- [ ] Nœud badge ajouté dans le mindmap
- [ ] Configuration : nom, description, image, critères d'attribution
- [ ] Export vers les badges Moodle

---

## Post-MVP — Bibliothèque OER (Could)

### US-60 — Chercher une ressource OER (Could)

> En tant qu'enseignant, je veux chercher des ressources éducatives libres afin d'enrichir mon cours.

**Critères d'acceptation :**
- [ ] Panneau de recherche avec filtres (discipline, niveau, format)
- [ ] Résultats avec aperçu
- [ ] Drag & drop d'une ressource OER vers le mindmap

---

## Post-MVP — LLM (Could)

### US-70 — Générer un quiz (Could)

> En tant qu'enseignant, je veux générer des questions de quiz automatiquement afin de gagner du temps.

**Critères d'acceptation :**
- [ ] Sélection d'un nœud Quiz → bouton "Générer des questions"
- [ ] Saisie du sujet ou upload d'un document source
- [ ] Propositions de questions éditables avant validation

### US-71 — Suggérer une structure de cours (Could)

> En tant qu'enseignant, je veux obtenir une suggestion de structure de cours afin d'avoir un point de départ.

**Critères d'acceptation :**
- [ ] Saisie d'un titre et d'une description de cours
- [ ] Génération d'un mindmap complet (sections + activités suggérées)
- [ ] L'enseignant peut modifier librement la suggestion

---

## Administration SaaS

### US-80 — Tableau de bord administrateur (Must)

> En tant qu'administrateur Kàggu, je veux voir un tableau de bord avec les KPIs afin de superviser la plateforme.

**Critères d'acceptation :**
- [ ] Le dashboard affiche : organisations actives/suspendues, licences actives, MRR, exports (jour/mois), appels API (jour)
- [ ] Un graphique montre les exports quotidiens sur 30 jours
- [ ] Un graphique montre les nouvelles organisations par semaine
- [ ] Un fil d'activité affiche les 20 derniers événements
- [ ] Le dashboard n'est accessible qu'aux utilisateurs `is_platform_admin`

### US-81 — Générer des clés de licence (Must)

> En tant qu'administrateur, je veux générer des clés de licence afin de les fournir aux organisations clientes.

**Critères d'acceptation :**
- [ ] Un bouton « Générer une licence » ouvre un modal (sélection org + abonnement)
- [ ] La clé générée est affichée dans un modal copiable
- [ ] La clé suit le format `KGU-{TIER}-{8}-{8}-{4}`
- [ ] La génération est loguée dans `usage_logs`

### US-82 — Suspendre / Révoquer une licence (Must)

> En tant qu'administrateur, je veux suspendre ou révoquer une licence afin de gérer les abus ou impayés.

**Critères d'acceptation :**
- [ ] Bouton « Suspendre » avec confirmation → statut `suspended`
- [ ] Bouton « Révoquer » avec double confirmation → statut `revoked` (irréversible)
- [ ] Le plugin Moodle détecte la suspension/révocation lors de la prochaine validation
- [ ] L'action est loguée dans `usage_logs`

### US-83 — Statistiques d'utilisation par organisation (Must)

> En tant qu'administrateur, je veux voir les statistiques d'utilisation par organisation afin de suivre l'activité de la plateforme.

**Critères d'acceptation :**
- [ ] La page d'usage permet de filtrer par organisation, période et type d'événement
- [ ] Un graphique montre l'évolution des événements par jour
- [ ] Un tableau liste les événements avec détails et pagination
- [ ] Le détail d'une organisation affiche un résumé d'usage (30 derniers jours)

### US-84 — Gérer les plans d'abonnement (Should)

> En tant qu'administrateur, je veux gérer les plans d'abonnement (CRUD) afin d'ajuster l'offre commerciale.

**Critères d'acceptation :**
- [ ] La page plans affiche la liste triée par `sort_order`
- [ ] Un formulaire modal permet de créer/modifier un plan (nom, prix, limites, features)
- [ ] Un plan peut être désactivé (`is_active = false`)
- [ ] Les abonnements existants conservent leurs limites jusqu'au renouvellement

### US-85 — Saisir la clé de licence dans Moodle (Must)

> En tant qu'administrateur Moodle, je veux saisir ma clé de licence dans local_kaggu afin d'activer le service.

**Critères d'acceptation :**
- [ ] Le plugin affiche un champ « License Key » dans ses réglages admin
- [ ] La clé est validée auprès du backend Kàggu à la sauvegarde
- [ ] Un message de succès affiche le plan et la date d'expiration
- [ ] Un message d'erreur clair s'affiche si la clé est invalide, expirée ou déjà liée à une autre instance
- [ ] La licence est revalidée automatiquement toutes les 24h via tâche cron

---

## Récapitulatif des priorités

| Priorité | Stories | Scope |
|----------|---------|-------|
| **Must (P0)** | US-01 à US-04, US-10 à US-17, US-20 à US-23, US-30 à US-32 | MVP |
| **Must (SaaS)** | US-80 à US-83, US-85 | SaaS licensing & admin |
| **Should (P1)** | US-18, US-19, US-40 à US-42, US-84 | Post-MVP v1 |
| **Could (P2)** | US-50, US-60, US-70, US-71 | Post-MVP v2 |

## Flux complet MVP

```
US-30 (Inscription) → US-31 (Connexion) → US-01 (Créer projet)
  → US-10 (Ajouter sections) → US-11/US-12 (Ajouter ressources/activités)
  → US-13 (Configurer les nœuds) → US-14 (Organiser)
  → US-04 (Sauvegarde auto)
  → US-20 (Configurer Moodle) → US-21 (Exporter)
  → US-22 (Mettre à jour) ou US-23 (Importer)
```

## Flux admin SaaS

```
US-80 (Dashboard) → supervision globale
US-81 (Générer clé) → US-85 (Saisir clé dans Moodle) → licence active
US-82 (Suspendre/Révoquer) → gestion des abus
US-83 (Stats usage) → suivi par organisation
US-84 (Gérer plans) → ajustement de l'offre
```
