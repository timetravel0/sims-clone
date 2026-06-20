/**
 * Personality — five trait axes, each -1.0 to +1.0.
 * Generated randomly at Sim creation, or passed explicitly.
 *
 * outgoing    : prefers social interactions, initiates first
 * neurotic    : needs decay faster, mood swings more extreme
 * playful     : seeks fun objects, tells jokes over compliments
 * nice        : favours positive interactions, rarely argues
 * ambitious   : needs degrade slower but unsatisfied needs cause bigger mood penalty
 *
 * These scores modulate:
 *  - need decay rates (SimNeeds)
 *  - interaction type selection (SocialAction)
 *  - planner weights (NeedDrivenPlanner)
 *  - random event susceptibility (PersonalityEvents)
 */
export class Personality {
  constructor(traits = {}) {
    this.outgoing   = this._clamp(traits.outgoing   ?? this._rand());
    this.neurotic   = this._clamp(traits.neurotic   ?? this._rand());
    this.playful    = this._clamp(traits.playful    ?? this._rand());
    this.nice       = this._clamp(traits.nice       ?? this._rand());
    this.ambitious  = this._clamp(traits.ambitious  ?? this._rand());
  }

  _rand()         { return (Math.random() * 2 - 1); }
  _clamp(v)       { return Math.max(-1, Math.min(1, v)); }

  /** Natural-language summary for the UI / narrative log */
  describe() {
    const tags = [];
    if (this.outgoing   >  0.4) tags.push('extrovert');
    if (this.outgoing   < -0.4) tags.push('introvert');
    if (this.neurotic   >  0.4) tags.push('anxious');
    if (this.neurotic   < -0.4) tags.push('laid-back');
    if (this.playful    >  0.4) tags.push('playful');
    if (this.playful    < -0.4) tags.push('serious');
    if (this.nice       >  0.4) tags.push('kind');
    if (this.nice       < -0.4) tags.push('mean');
    if (this.ambitious  >  0.4) tags.push('ambitious');
    if (this.ambitious  < -0.4) tags.push('lazy');
    return tags.length > 0 ? tags.join(', ') : 'balanced';
  }

  serialise() {
    return {
      outgoing: this.outgoing, neurotic: this.neurotic,
      playful:  this.playful,  nice:     this.nice, ambitious: this.ambitious
    };
  }

  static restore(data) { return new Personality(data); }
}
