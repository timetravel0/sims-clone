/**
 * SkillAction — FSM action that uses a furniture object AND trains a skill.
 *
 * Extends the UseObject pattern: applies affordance utility over the duration
 * and at completion calls sim.career.trainSkill(skill, amount).
 *
 * Created by UtilityAIPlanner when an affordance has a `skill` field:
 *   { verb:'study', utility:{autonomy:20,status:10}, duration:8, skill:'logic', skillGain:3 }
 */
export class SkillAction {
  constructor(sim, furniture, affordance, skill, skillAmount = 2) {
    this._sim        = sim;
    this._furniture  = furniture;
    this._affordance = affordance;
    this._skill      = skill;
    this._amount     = skillAmount;
    this._elapsed    = 0;
    this._duration   = affordance.duration ?? 5;
    this.done        = false;
    this.label       = `Training ${skill}`;
  }

  enter() {
    this._furniture.reservedBy = this._sim.id;
    this._furniture.inUse      = true;
    this._sim.showBubble?.(`📚 ${this._skill}`, 1.5);
  }

  update(dt) {
    this._elapsed += dt;
    const rate = 1 / this._duration;
    if (this._affordance.utility) {
      for (const [need, val] of Object.entries(this._affordance.utility)) {
        this._sim.needs?.modify(need, val * rate * dt);
      }
    }
    if (this._elapsed >= this._duration) this.done = true;
  }

  exit() {
    this._furniture.inUse      = false;
    this._furniture.reservedBy = null;
    if (this.done) this._sim.career?.trainSkill(this._skill, this._amount);
  }
}
