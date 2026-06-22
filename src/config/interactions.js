/**
 * interactions.js — social model configuration (Stream B extraction).
 *
 * DIMENSIONS   directional relationship dimensions.
 * DRIFT        passive drift per in-game second (negative = decays toward 0).
 * INTERACTIONS catalogue: what each social act REQUIRES, how likely it is to be
 *              ACCEPTED, and how it MOVES the relationship.
 *   effects.ab = deltas to actor→target dims; effects.ba = target→actor dims.
 *   `needsConsent` interactions are gated by an acceptance check; the rest happen
 *   unilaterally (you can't stop someone insulting or avoiding you).
 */

export const DIMENSIONS = [
  'trust', 'affection', 'respect', 'attraction',
  'resentment', 'fear', 'familiarity', 'dependency',
];

export const DRIFT = {
  trust: -0.02, affection: -0.02, respect: -0.015, attraction: -0.03,
  resentment: -0.05, fear: -0.06, familiarity: -0.005, dependency: -0.04,
};

export const INTERACTIONS = {
  chat:        { label: 'Chat',        emoji: '💬', duration: 4, valence:  1, needsConsent: true,  cooldown: 12,
                 accept: { ab: { familiarity: 4, affection: 2, trust: 1 }, ba: { familiarity: 4, affection: 2, trust: 1 } } },
  joke:        { label: 'Joke',        emoji: '😄', duration: 4, valence:  1, needsConsent: true,  cooldown: 16,
                 accept: { ab: { affection: 3, familiarity: 3 }, ba: { affection: 4, familiarity: 3, respect: 1 } } },
  compliment:  { label: 'Compliment',  emoji: '🌟', duration: 4, valence:  1, needsConsent: true,  cooldown: 20,
                 accept: { ab: { affection: 2 }, ba: { affection: 5, trust: 2, respect: 1 } } },
  hug:         { label: 'Hug',         emoji: '🤗', duration: 5, valence:  1, needsConsent: true,  cooldown: 25,
                 requires: (s) => s.ba.affection >= 10 || s.ba.familiarity >= 25,
                 accept: { ab: { affection: 6, trust: 3 }, ba: { affection: 6, trust: 3, fear: -2 } } },
  argue:       { label: 'Argue',       emoji: '😠', duration: 5, valence: -1, needsConsent: false, cooldown: 18,
                 accept: { ab: { resentment: 8, trust: -4, affection: -3 }, ba: { resentment: 8, trust: -4, affection: -3 } } },
  insult:      { label: 'Insult',      emoji: '🤬', duration: 3, valence: -1, needsConsent: false, cooldown: 22,
                 accept: { ab: { resentment: 5, respect: -2 }, ba: { resentment: 12, fear: 4, trust: -6, affection: -6 } } },

  apologize:   { label: 'Apologize',   emoji: '🙏', duration: 4, valence:  1, needsConsent: true,  cooldown: 30,
                 requires: (s) => s.ba.resentment >= 10,
                 accept: { ab: { respect: 2, resentment: -4 }, ba: { resentment: -14, trust: 5, affection: 3, fear: -3 } } },
  forgive:     { label: 'Forgive',     emoji: '🕊️', duration: 4, valence:  1, needsConsent: true,  cooldown: 30,
                 requires: (s) => s.ab.resentment >= 10,
                 accept: { ab: { resentment: -16, affection: 4, trust: 3 }, ba: { affection: 3, respect: 3 } } },
  confront:    { label: 'Confront',    emoji: '⚡', duration: 5, valence: -1, needsConsent: false, cooldown: 24,
                 requires: (s) => s.ab.resentment >= 12,
                 accept: { ab: { resentment: -4, respect: 3 }, ba: { resentment: 6, fear: 3, respect: 2 } } },
  avoid:       { label: 'Avoid',       emoji: '🙈', duration: 2, valence: -1, needsConsent: false, cooldown: 20,
                 accept: { ab: { familiarity: -3, affection: -2 }, ba: { familiarity: -2, resentment: 2 } } },
  ask_help:    { label: 'Ask for help',emoji: '🆘', duration: 4, valence:  1, needsConsent: true,  cooldown: 28,
                 requires: (s, c) => c.actorNeedLow,
                 accept: { ab: { dependency: 6, trust: 3, affection: 2 }, ba: { respect: 1, affection: 2 } } },
  offer_help:  { label: 'Offer help',  emoji: '🤝', duration: 4, valence:  1, needsConsent: true,  cooldown: 26,
                 requires: (s, c) => c.targetNeedLow,
                 accept: { ab: { affection: 3, respect: 2 }, ba: { trust: 6, affection: 5, dependency: 4 } } },
  comfort:     { label: 'Comfort',     emoji: '🫂', duration: 5, valence:  1, needsConsent: true,  cooldown: 24,
                 requires: (s, c) => c.targetMoodLow,
                 accept: { ab: { affection: 4 }, ba: { trust: 7, affection: 6, fear: -4, resentment: -4 } } },
  gossip:      { label: 'Gossip',      emoji: '🗣️', duration: 4, valence:  1, needsConsent: false, cooldown: 18,
                 accept: { ab: { familiarity: 4, affection: 3, trust: 2 }, ba: { familiarity: 4, affection: 3, trust: 2 } } },
  flirt:       { label: 'Flirt',       emoji: '😉', duration: 4, valence:  1, needsConsent: true,  cooldown: 20,
                 requires: (s, c) => c.compatible && s.ab.attraction >= 4 || s.ab.affection >= 15,
                 accept: { ab: { attraction: 7, affection: 3 }, ba: { attraction: 6, affection: 3 } },
                 reject: { ab: { attraction: -5, resentment: 6, affection: -4 }, ba: { fear: 1 } } },
  reject_flirt:{ label: 'Reject flirt',emoji: '🚫', duration: 3, valence: -1, needsConsent: false, cooldown: 20,
                 accept: { ab: { attraction: -6, affection: -3 }, ba: { resentment: 5, affection: -4 } } },
};
