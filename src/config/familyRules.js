/**
 * familyRules.js — household constraints & education model (WP5 / Milestone 9).
 *
 * Replaces the single MAX_HOUSEHOLD gate with explicit, testable limits on
 * autonomous reproduction, and defines the education ladder used to seed
 * households and bias career entry.
 */
export const FAMILY_RULES = {
  maxHouseholdSize:     6,   // total household members
  maxChildrenPerCouple: 3,   // children sharing the same two parents
  maxDependentChildren: 4,   // child records currently in the household
  birthFundsThreshold:  3000, // financial readiness (budget §)
  minRomanceForChild:   45,  // relationship stability (graph romance score)
  allowAutonomousBirths: true, // master switch for autonomous reproduction
};

/**
 * Fertility profile (M9 rich): per-person reproductive disposition.
 *   desire    — how much this Sim wants children (scales birth probability)
 *   fecundity — biological likelihood once a birth is attempted
 */
export function defaultFertility() {
  return {
    desire:    +(0.35 + Math.random() * 0.55).toFixed(2),
    fecundity: +(0.55 + Math.random() * 0.40).toFixed(2),
  };
}

// Education ladder. Higher education → better career entry (start level + skill).
export const EDUCATION = { none: 0, highschool: 1, college: 2, university: 3 };
export const EDUCATION_LABELS = ['None', 'High School', 'College', 'University'];

export function educationLabel(level = 0) {
  return EDUCATION_LABELS[Math.max(0, Math.min(EDUCATION_LABELS.length - 1, level))];
}
