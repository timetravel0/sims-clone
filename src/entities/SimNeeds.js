export class SimNeeds {
  constructor() {
    this.values = {
      hunger: 80, energy: 80, bladder: 80, hygiene: 80,
      social: 80, fun: 80, comfort: 80, room: 80,
    };
    this.decay = {
      hunger: -0.9, energy: -0.35, bladder: -0.7, hygiene: -0.45,
      social: -0.3, fun: -0.55, comfort: -0.2, room: -0.05,
    };
    this.criticalThreshold = 35;
  }
  tick(dt) {
    for (const key of Object.keys(this.values))
      this.values[key] = Math.max(0, Math.min(100, this.values[key] + this.decay[key] * dt));
  }
  getCritical() {
    return Object.entries(this.values).sort((a, b) => a[1] - b[1])[0][0];
  }
  getAll() { return { ...this.values }; }
  modify(need, amount) {
    if (this.values[need] !== undefined)
      this.values[need] = Math.max(0, Math.min(100, this.values[need] + amount));
  }
  average() {
    const v = Object.values(this.values);
    return v.reduce((a, b) => a + b, 0) / v.length;
  }
}
