import { NeedDrivenPlanner } from '../ai/NeedDrivenPlanner.js';
import { ActionQueue } from '../ai/ActionQueue.js';

export class SimBrain {
  constructor(sim, eventBus) {
    this.sim = sim;
    this.eventBus = eventBus;
    this.planner = new NeedDrivenPlanner();
    this.queue = new ActionQueue();
    this.lastPlan = null;
  }
  update(dt, world) {
    if (this.queue.isEmpty()) {
      const plan = this.planner.plan(this.sim, world);
      if (plan && plan.length) {
        plan.forEach(action => this.queue.push(action));
        this.lastPlan = plan.map(a => a.name).join(' > ');
        this.eventBus.emit('sim:action', { sim: this.sim.name, action: this.lastPlan });
      }
    }
    this.queue.update(dt);
  }
}
