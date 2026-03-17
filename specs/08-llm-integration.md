# Intégration LLM — Kàggu (Post-MVP, P2)

## Contexte

L'intégration d'un LLM (Claude via l'API Anthropic) permet d'assister l'enseignant dans la conception pédagogique : génération de contenu, suggestion de structures de cours, création automatique de questions de quiz.

**SDK :** `@anthropic-ai/sdk` (npm)

## Fonctionnalités

### Génération de contenu (P2)

| Fonctionnalité | Entrée | Sortie |
|---------------|--------|--------|
| Générer un quiz | Sujet + niveau + nombre de questions | Questions QCM / Vrai-Faux / Réponse courte |
| Générer un résumé | Document source (texte ou PDF) | Résumé structuré pour une Page Moodle |
| Générer des exercices | Objectifs pédagogiques | Énoncés d'exercices avec corrigés |
| Rédiger une description | Titre du module | Description (champ `intro`) pour le module |

**Workflow utilisateur :**
1. Sélectionner un nœud dans le mindmap
2. Cliquer sur "Assistant IA" dans le panneau de propriétés
3. Saisir les instructions (ou sélectionner un template de prompt)
4. Réviser et valider le contenu généré
5. Le contenu est injecté dans les propriétés du nœud

### Assistant de conception de parcours (P2)

L'enseignant décrit son cours en langage naturel et le LLM génère une structure de mindmap complète :

**Prompt type :**
> "Crée un cours de physique quantique pour L3, 12 semaines, avec des quiz hebdomadaires et un projet final."

**Sortie :** Mindmap JSON avec sections, ressources et activités pré-configurées, que l'enseignant peut modifier.

### Analyse de cohérence pédagogique (P2)

Le LLM analyse le mindmap et suggère :
- Des activités manquantes (ex: pas d'évaluation dans une section)
- Des incohérences (ex: prérequis absent)
- Des améliorations pédagogiques

## Architecture

```
Frontend                Backend               Anthropic API
   │                      │                       │
   │  "Générer un quiz"   │                       │
   ├─────────────────────>│                       │
   │                      │  POST /v1/messages    │
   │                      ├──────────────────────>│
   │                      │                       │
   │                      │  Streaming response   │
   │                      │<──────────────────────┤
   │  SSE (streaming)     │                       │
   │<─────────────────────┤                       │
   │                      │                       │
```

- Les appels LLM passent par le backend (la clé API n'est jamais exposée côté client)
- Streaming SSE pour afficher la génération en temps réel
- Le backend enrichit le prompt avec le contexte du mindmap (structure actuelle, type de nœud)

## Gestion des coûts et quotas

| Paramètre | Valeur suggérée |
|-----------|----------------|
| Modèle par défaut | claude-sonnet-4-6 (bon rapport coût/qualité) |
| Tokens max par requête | 4096 (sortie) |
| Limite par utilisateur | 50 requêtes/jour (configurable) |
| Limite par projet | 200 requêtes/mois |

**Monitoring :**
- Compteur de tokens consommés par utilisateur/projet
- Alerte à 80 % du quota
- Possibilité de désactiver le LLM sans impacter le reste de l'application

## Règles métier

- Le contenu généré est toujours présenté comme proposition (jamais injecté automatiquement)
- L'enseignant doit valider avant insertion dans le mindmap
- Les prompts système incluent le contexte pédagogique (niveau, discipline, objectifs)
- Les données du cours ne sont pas utilisées pour l'entraînement (politique Anthropic API)

## Critères d'acceptation

- [ ] L'enseignant peut générer du contenu pour un nœud sélectionné
- [ ] La génération est affichée en streaming (temps réel)
- [ ] L'enseignant peut modifier et valider le contenu avant insertion
- [ ] L'assistant de conception génère un mindmap complet à partir d'une description
- [ ] Les quotas sont respectés et l'utilisateur est informé de sa consommation
- [ ] L'application fonctionne normalement si le LLM est désactivé ou indisponible
