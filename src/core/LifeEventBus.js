import { bus } from './EventBus.js';

export class LifeEventBus {
  emit(type, payload = {}) {
    const event = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      type,
      ts: Date.now(),
      gameTime: window._game?.clock?.hour ?? 0,
      ...payload,
    };
    bus.emit('life:event', event);
    return event;
  }
}

export const lifeEventBus = new LifeEventBus();
