// ─── Scenarization Profiles ───────────────────────────────────────────────────
// Pedagogical presets that inject structured instructions into Phase A, B and Phase 2 prompts.
// Instructions are prepended to the user's additionalContext / additionalText fields.

export interface ScenarizationProfile {
  id: string;
  name: string;
  icon: string;
  tagline: string;
  // Display labels
  bloomLabel: string;
  styleLabel: string;
  styleIcon: string;
  // Internal params
  bloomLevel: 'remember' | 'understand' | 'apply' | 'analyze' | 'evaluate' | 'create';
  pedagogicalStyle: 'transmissive' | 'active' | 'hybrid';
  practicalRatio: number; // % of practical activities per module
  evaluationDensity: 'low' | 'medium' | 'high';
  contentDepth: 'overview' | 'standard' | 'deep';
  quizDifficulty: 'easy' | 'medium' | 'hard';
}

export const BUILTIN_PROFILES: ScenarizationProfile[] = [
  {
    id: 'quick-skills',
    name: 'Formation courte',
    icon: '⚡',
    tagline: 'Montée en compétences rapide, orientée pratique',
    bloomLabel: 'Appliquer',
    styleLabel: 'Actif',
    styleIcon: '🎯',
    bloomLevel: 'apply',
    pedagogicalStyle: 'active',
    practicalRatio: 65,
    evaluationDensity: 'high',
    contentDepth: 'standard',
    quizDifficulty: 'medium',
  },
  {
    id: 'academic',
    name: 'Cours académique',
    icon: '🎓',
    tagline: 'Contenu rigoureux, progression structurée',
    bloomLabel: 'Analyser / Évaluer',
    styleLabel: 'Transmissif',
    styleIcon: '📖',
    bloomLevel: 'analyze',
    pedagogicalStyle: 'transmissive',
    practicalRatio: 30,
    evaluationDensity: 'medium',
    contentDepth: 'deep',
    quizDifficulty: 'hard',
  },
  {
    id: 'mooc',
    name: 'e-learning autonome',
    icon: '🖥️',
    tagline: 'Modules indépendants, accessibles en autonomie',
    bloomLabel: 'Comprendre → Appliquer',
    styleLabel: 'Hybride',
    styleIcon: '⚖️',
    bloomLevel: 'understand',
    pedagogicalStyle: 'hybrid',
    practicalRatio: 50,
    evaluationDensity: 'medium',
    contentDepth: 'standard',
    quizDifficulty: 'easy',
  },
  {
    id: 'certification',
    name: 'Certification pro',
    icon: '🏆',
    tagline: 'Niveau expert, évaluations intensives',
    bloomLabel: 'Évaluer / Créer',
    styleLabel: 'Actif exigeant',
    styleIcon: '🎯',
    bloomLevel: 'evaluate',
    pedagogicalStyle: 'active',
    practicalRatio: 70,
    evaluationDensity: 'high',
    contentDepth: 'deep',
    quizDifficulty: 'hard',
  },
];

// ─── Instruction builders ─────────────────────────────────────────────────────

const BLOOM: Record<string, string> = {
  remember:  "Mémoriser — retenir les faits, définitions et concepts clés",
  understand:"Comprendre — expliquer et reformuler les concepts dans ses propres termes",
  apply:     "Appliquer — utiliser concrètement les acquis dans des situations pratiques",
  analyze:   "Analyser — décomposer les concepts et identifier les relations entre eux",
  evaluate:  "Évaluer — porter un jugement critique et prendre des décisions argumentées",
  create:    "Créer — produire quelque chose de nouveau en mobilisant ses compétences",
};

const STYLE: Record<string, string> = {
  transmissive: "transmissif — exposés théoriques rigoureux, définitions précises, structure académique",
  active:       "actif — exercices pratiques, mises en situation réelles, résolution de problèmes concrets",
  hybrid:       "hybride — alterner explications accessibles et activités de vérification en autonomie",
};

const DENSITY: Record<string, string> = {
  low:    "légères — 1 quiz optionnel par section si pertinent",
  medium: "modérées — 1 quiz de compréhension + 1 devoir d'analyse par section",
  high:   "denses — 1 quiz formatif obligatoire + 1 devoir pratique noté par section (completion=2)",
};

const DEPTH: Record<string, string> = {
  overview: "pages courtes (3-4 paragraphes), l'essentiel sans détails superflus",
  standard: "pages équilibrées (5-7 paragraphes), exemples concrets, un encadré récapitulatif",
  deep:     "pages approfondies (8-12 paragraphes), définitions formelles, sous-sections structurées",
};

const QUIZ_DIFF: Record<string, string> = {
  easy:   "facile — questions de rappel et compréhension simple, feedback encourageant",
  medium: "moyen — questions d'application sur situations concrètes, feedback explicatif détaillé",
  hard:   "élevé — scénarios complexes multi-étapes, jugement critique, questions pièges fréquents",
};

const STYLE_CONTENT: Record<string, string> = {
  transmissive: "structure académique : définition → développement → exemples → synthèse",
  active:       "débuter par un exemple concret avant la théorie, terminer par un encadré \"À pratiquer\"",
  hybrid:       "ton engageant, commencer par \"Pourquoi c'est important ?\", nombreuses analogies et cas concrets",
};

const STYLE_SUMMARY: Record<string, string> = {
  transmissive: "théorique et rigoureuse",
  active:       "pratique et opérationnelle",
  hybrid:       "équilibrée théorie/pratique",
};

/**
 * Builds the pedagogical instruction block injected into the LLM prompt for a given phase.
 * - 'analyze'   → Phase A  (analyzeDocument)
 * - 'structure' → Phase B  (scenarizeCourseFromDocument, per section)
 * - 'content'   → Phase 2  (generatePageHtml + generateQuizForScen)
 */
export function buildPedagogicalInstructions(
  profile: ScenarizationProfile,
  phase: 'analyze' | 'structure' | 'content',
): string {
  if (phase === 'analyze') {
    return `PROFIL PÉDAGOGIQUE — ${profile.name} :
• Bloom visé : ${BLOOM[profile.bloomLevel]}
• Style : ${STYLE[profile.pedagogicalStyle]}
• Organiser les sections autour de compétences cohérentes avec ce niveau Bloom
• Les contentSummary doivent refléter une orientation ${STYLE_SUMMARY[profile.pedagogicalStyle]}`;
  }

  if (phase === 'structure') {
    return `PROFIL PÉDAGOGIQUE — ${profile.name} :
• Bloom visé : ${BLOOM[profile.bloomLevel]}
• Style : ${STYLE[profile.pedagogicalStyle]}
• Composition du module : ~${profile.practicalRatio}% activités pratiques (quiz, assign) / ${100 - profile.practicalRatio}% contenu (pages)
• Évaluations : ${DENSITY[profile.evaluationDensity]}
• ${profile.pedagogicalStyle === 'active' ? "Privilégier les devoirs avec livrables concrets et les quiz d'application directe" : profile.pedagogicalStyle === 'transmissive' ? "Privilégier les pages approfondies, les devoirs d'analyse et de synthèse" : "Pages accessibles suivies de quiz courts (3-4 questions) pour valider chaque concept"}`;
  }

  // phase === 'content'
  return `PROFIL PÉDAGOGIQUE — ${profile.name} :
• Pages : ${DEPTH[profile.contentDepth]}
• Style de rédaction : ${STYLE_CONTENT[profile.pedagogicalStyle]}
• Quiz : difficulté ${QUIZ_DIFF[profile.quizDifficulty]}`;
}
