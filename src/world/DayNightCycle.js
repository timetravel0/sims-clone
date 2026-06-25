import * as THREE from 'three';
import { bus } from '../core/EventBus.js';
import cfg from '../config/gameConfig.js';

// Real seconds per in-game day at 1× speed. Default 86400 ⇒ 1× is literal
// real-time (a game-day takes 24 real hours); faster presets (cfg.time.speeds)
// make it playable. Read live from cfg so the God/Admin page can retune it
// mid-game. (Was a hardcoded 1440 = a day in 24 real minutes.)
const dayDuration = () => cfg.time?.dayDurationSec ?? 1440;

const SKY_COLORS = [
  { t: 0.00, sky: new THREE.Color(0x0a0a1a), amb: 0.15 }, // midnight
  { t: 0.25, sky: new THREE.Color(0x1a1040), amb: 0.20 }, // pre-dawn
  { t: 0.30, sky: new THREE.Color(0xff8c42), amb: 0.55 }, // sunrise
  { t: 0.40, sky: new THREE.Color(0x87ceeb), amb: 0.75 }, // morning
  { t: 0.60, sky: new THREE.Color(0x6ab4e8), amb: 0.90 }, // noon
  { t: 0.75, sky: new THREE.Color(0xff6b35), amb: 0.65 }, // sunset
  { t: 0.85, sky: new THREE.Color(0x1a0a30), amb: 0.25 }, // dusk
  { t: 1.00, sky: new THREE.Color(0x0a0a1a), amb: 0.15 }, // midnight again
];

export class DayNightCycle {
  constructor(scene) {
    this._scene = scene;
    this.time = 0.35; // start at morning
    this.totalDays = 0;

    this._ambient = new THREE.AmbientLight(0xfff5e0, 0.75);
    scene.add(this._ambient);

    this._sun = new THREE.DirectionalLight(0xfff0cc, 1.4);
    this._sun.castShadow = true;
    this._sun.shadow.mapSize.set(2048, 2048);
    this._sun.shadow.camera.near = 0.5;
    this._sun.shadow.camera.far = 80;
    this._sun.shadow.camera.left = -20;
    this._sun.shadow.camera.right = 20;
    this._sun.shadow.camera.top = 20;
    this._sun.shadow.camera.bottom = -20;
    scene.add(this._sun);

    this._moon = new THREE.DirectionalLight(0x8888cc, 0.2);
    this._moon.position.set(-10, 15, -10);
    scene.add(this._moon);

    // Stars (particles visible at night)
    this._stars = this._buildStars();
    scene.add(this._stars);

    this._apply();
  }

  _buildStars() {
    const geo = new THREE.BufferGeometry();
    const positions = [];
    for (let i = 0; i < 400; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.acos(2 * Math.random() - 1);
      const r = 60;
      positions.push(
        r * Math.sin(phi) * Math.cos(theta),
        Math.abs(r * Math.cos(phi)) + 10,
        r * Math.sin(phi) * Math.sin(theta)
      );
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.18, transparent: true, opacity: 0 }));
  }

  _lerpKeyframes(t) {
    const kf = SKY_COLORS;
    let a = kf[kf.length - 1], b = kf[0];
    for (let i = 0; i < kf.length - 1; i++) {
      if (t >= kf[i].t && t < kf[i + 1].t) { a = kf[i]; b = kf[i + 1]; break; }
    }
    const span = b.t - a.t || 1;
    const alpha = (t - a.t) / span;
    const sky = new THREE.Color().lerpColors(a.sky, b.sky, alpha);
    const amb = a.amb + (b.amb - a.amb) * alpha;
    return { sky, amb };
  }

  _apply() {
    const { sky, amb } = this._lerpKeyframes(this.time);
    this._scene.background = sky;
    this._scene.fog.color = sky;
    this._ambient.intensity = amb;

    // Sun arc
    const angle = this.time * Math.PI * 2 - Math.PI / 2;
    this._sun.position.set(Math.cos(angle) * 25, Math.sin(angle) * 25, 8);
    this._sun.intensity = Math.max(0, Math.sin(angle + Math.PI / 2)) * 1.4;

    // Stars fade in at night
    const nightness = this.time < 0.28 || this.time > 0.78
      ? 1 - Math.min(1, Math.abs(this.time - (this.time < 0.5 ? 0.30 : 0.78)) * 10)
      : 0;
    this._stars.material.opacity = nightness;
    this._moon.intensity = nightness * 0.3;
  }

  update(dt) {
    const prevTime = this.time;
    this.time = (this.time + dt / dayDuration()) % 1;
    if (this.time < prevTime) this.totalDays += 1;
    this._apply();
    bus.emit('daynight:update', { time: this.time, hour: Math.floor(this.time * 24) });
  }

  /** 0–23 */
  get hour() { return Math.floor(this.time * 24); }
}
