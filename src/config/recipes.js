/**
 * recipes.js — minimal recipe catalogue for the food lifecycle (WP3, Milestone 7).
 *
 * A recipe is chosen by the cook's cooking skill; better cooks unlock richer
 * dishes with more servings. Quality (poor/normal/good/excellent) is computed in
 * CookMealAction from skill + available appliances, not stored here.
 */
export const RECIPES = [
  { id: 'cereal',   label: 'Cereal',        skillMin: 0, servings: 1 },
  { id: 'sandwich', label: 'Sandwich',      skillMin: 0, servings: 2 },
  { id: 'pasta',    label: 'Pasta',         skillMin: 2, servings: 3 },
  { id: 'stir_fry', label: 'Stir Fry',      skillMin: 3, servings: 3 },
  { id: 'roast',    label: 'Roast Dinner',  skillMin: 5, servings: 4 },
  { id: 'gourmet',  label: 'Gourmet Plate', skillMin: 8, servings: 4 },
];

/** Best recipe the cook can attempt at the given cooking skill. */
export function pickRecipe(skill = 0) {
  const eligible = RECIPES.filter(r => skill >= r.skillMin);
  return eligible[eligible.length - 1] ?? RECIPES[0];
}
