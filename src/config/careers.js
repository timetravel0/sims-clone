/**
 * careers.js — career catalogue (WP2: Careers Expansion, Milestone 8).
 *
 * 34 tracks across 10 families with differentiated schedules, required skills,
 * salaries and a per-career `stress` factor (0..1) that feeds work-stress and
 * burnout in CareerSystem. Each track has 10 levels.
 *
 * Skill names must come from SkillSystem.SKILLS:
 *   cooking, logic, charisma, fitness, creativity, handiness
 *
 * Schedule presets use day indices 0=Mon .. 6=Sun. Overnight shifts (start>end)
 * are handled by CareerSystem._isInShift.
 */

// ── Schedule presets ────────────────────────────────────────────────────────
const D = (days, start, end) => days.map(day => ({ day, start, end }));
const DAY   = D([0, 1, 2, 3, 4], 8, 17);   // standard office week
const EARLY = D([0, 1, 2, 3, 4], 6, 14);   // early start
const SWING = D([0, 1, 2, 3, 4], 14, 22);  // afternoon→evening
const NIGHT = D([0, 1, 2, 3, 4], 22, 6);   // overnight
const HOSPI = D([2, 3, 4, 5, 6], 16, 24);  // Wed–Sun evenings (hospitality)
const PART  = D([0, 2, 4], 9, 13);         // Mon/Wed/Fri mornings (part-time)
const FLEX  = D([1, 3, 5], 10, 16);        // Tue/Thu/Sat (creative/freelance)
const EMERG = D([0, 3, 6], 8, 20);         // long emergency shifts

/**
 * @param {Array<[string,number]>} skill  [skillName, minLevelForBonus] pairs
 */
function career(id, label, icon, family, skill, stress, salaryBase, salaryPerLevel, shifts) {
  const skillReq = Object.fromEntries((skill ?? []).map(([s, m]) => [s, m]));
  return {
    id, label, emoji: icon, icon, family,
    levels: 10,
    skillReq, requiredSkill: skillReq,
    skillRequired: skill?.[0]?.[0] ?? null,
    stress,                       // 0..1 — feeds work-stress / burnout
    shifts,
    salaryBase,
    salaryPerLevel,
    salaryStep: salaryPerLevel,   // legacy alias
    salaryPerDay: salaryBase + salaryPerLevel,
  };
}

export const CAREERS = [
  {
    id: 'unemployed', label: 'Unemployed', emoji: '-', icon: '-', family: 'none',
    levels: 1, requiredSkill: {}, skillReq: {}, skillRequired: null, stress: 0,
    shifts: [], salaryBase: 0, salaryPerLevel: 0, salaryStep: 0, salaryPerDay: 0,
  },

  // ── Culinary ──
  career('dishwasher',   'Dishwasher',    '🍽️', 'culinary', [['cooking', 0]],                 0.40,  70, 15, HOSPI),
  career('line_cook',    'Line Cook',     '🔪', 'culinary', [['cooking', 2]],                 0.50, 110, 35, HOSPI),
  career('chef',         'Chef',          '👨‍🍳', 'culinary', [['cooking', 4]],                 0.50, 150, 50, EARLY),
  career('restaurateur', 'Restaurateur',  '🍴', 'culinary', [['cooking', 5], ['charisma', 3]], 0.60, 220, 70, HOSPI),

  // ── Science & Medicine ──
  career('lab_assistant','Lab Assistant', '🧪', 'science',  [['logic', 1]],                   0.30, 120, 40, DAY),
  career('scientist',    'Scientist',     '🔬', 'science',  [['logic', 2]],                   0.35, 180, 60, DAY),
  career('doctor',       'Doctor',        '🩺', 'science',  [['logic', 5]],                   0.70, 280, 90, NIGHT),
  career('surgeon',      'Surgeon',       '⚕️', 'science',  [['logic', 7]],                   0.80, 400, 120, NIGHT),

  // ── Technology ──
  career('it_support',   'IT Support',    '🖥️', 'tech',     [['logic', 1]],                   0.40, 130, 45, DAY),
  career('programmer',   'Programmer',    '💻', 'tech',     [['logic', 2]],                   0.40, 200, 80, DAY),
  career('ai_engineer',  'AI Engineer',   '🤖', 'tech',     [['logic', 5]],                   0.50, 320, 110, DAY),
  career('cto',          'CTO',           '🏢', 'tech',     [['logic', 6], ['charisma', 4]],  0.70, 480, 150, DAY),

  // ── Education ──
  career('teaching_assistant', 'Teaching Assistant', '📓', 'education', [['charisma', 1]],            0.30, 110, 35, EARLY),
  career('teacher',      'Teacher',       '📚', 'education', [['charisma', 3]],                0.45, 170, 55, EARLY),
  career('professor',    'Professor',     '🎓', 'education', [['logic', 4], ['charisma', 3]],  0.40, 260, 85, DAY),

  // ── Business ──
  career('clerk',        'Clerk',         '🧾', 'business', [['charisma', 1]],                0.35, 120, 40, DAY),
  career('manager',      'Manager',       '📈', 'business', [['charisma', 3]],                0.55, 220, 70, DAY),
  career('executive',    'Executive',     '💼', 'business', [['charisma', 4], ['logic', 3]],  0.70, 380, 130, DAY),

  // ── Art & Entertainment ──
  career('artist',       'Artist',        '🎨', 'art',      [['creativity', 2]],              0.20, 120, 40, FLEX),
  career('musician',     'Musician',      '🎵', 'art',      [['creativity', 3]],              0.30, 150, 50, SWING),
  career('actor',        'Actor',         '🎭', 'art',      [['creativity', 3], ['charisma', 3]], 0.50, 240, 80, FLEX),
  career('influencer',   'Influencer',    '📱', 'art',      [['charisma', 4], ['creativity', 2]], 0.45, 200, 90, FLEX),

  // ── Fitness & Sport ──
  career('trainer',      'Trainer',       '🏋️', 'fitness',  [['fitness', 2]],                 0.35, 130, 45, EARLY),
  career('athlete',      'Athlete',       '🏃', 'fitness',  [['fitness', 3]],                 0.50, 200, 70, EARLY),
  career('coach',        'Coach',         '📣', 'fitness',  [['fitness', 4], ['charisma', 3]], 0.45, 220, 75, EARLY),

  // ── Public service ──
  career('police',       'Police Officer','👮', 'public',   [['fitness', 3]],                 0.60, 170, 55, EMERG),
  career('firefighter',  'Firefighter',   '🚒', 'public',   [['fitness', 4]],                 0.70, 190, 60, EMERG),
  career('civil_servant','Civil Servant', '🏛️', 'public',   [['logic', 1]],                   0.30, 140, 45, DAY),

  // ── Craft & Manual ──
  career('repair_worker','Repair Worker', '🔧', 'craft',    [['handiness', 2]],               0.40, 130, 45, DAY),
  career('carpenter',    'Carpenter',     '🪚', 'craft',    [['handiness', 3]],               0.45, 170, 55, EARLY),
  career('electrician',  'Electrician',   '⚡', 'craft',    [['handiness', 4]],               0.50, 200, 65, DAY),

  // ── Freelance ──
  career('writer',       'Writer',        '✍️', 'freelance', [['creativity', 3]],             0.25, 150, 55, FLEX),
  career('streamer',     'Streamer',      '🎮', 'freelance', [['charisma', 3], ['creativity', 2]], 0.40, 180, 80, FLEX),
  career('consultant',   'Consultant',    '🧠', 'freelance', [['logic', 4], ['charisma', 3]], 0.55, 300, 100, PART),
];
