/**
 * treatments.js — paid medical treatments (WP7 / Milestone 11).
 *
 * Each treatment has a cost and an effect: either it resolves the illness
 * outright (`resolves:true`) or it reduces severity by `drop`. `for` lists the
 * illnesses a treatment is appropriate for ('*' = any).
 */
export const TREATMENTS = [
  { id: 'consultation', label: 'Basic Consultation', cost: 120, resolves: false, drop: 0.4, for: ['*'] },
  { id: 'medicine',     label: 'Medicine',           cost: 80,  resolves: true,  for: ['cold', 'flu', 'fatigue'] },
  { id: 'urgent_care',  label: 'Urgent Care',        cost: 450, resolves: true,  for: ['injury', 'food poisoning', 'starvation'] },
  { id: 'home_visit',   label: 'Home Doctor Visit',  cost: 700, resolves: true,  for: ['*'] },
];

export const TREATMENT_BY_ID = new Map(TREATMENTS.map(t => [t.id, t]));

/** Pick the most appropriate affordable treatment for an illness/severity. */
export function pickTreatment(illness = '', severity = 0, funds = Infinity) {
  const ill = String(illness).toLowerCase();
  const urgent = TREATMENT_BY_ID.get('urgent_care');
  const medicine = TREATMENT_BY_ID.get('medicine');
  const consult = TREATMENT_BY_ID.get('consultation');

  // Severe or trauma-type illnesses → urgent care.
  if ((severity >= 0.8 || urgent.for.includes(ill)) && funds >= urgent.cost) return urgent;
  // Mild common illnesses → cheap medicine.
  if (medicine.for.includes(ill) && funds >= medicine.cost) return medicine;
  // Fallback → consultation (reduces severity) if affordable.
  if (funds >= consult.cost) return consult;
  return null;
}
