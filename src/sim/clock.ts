import { useSyncExternalStore } from 'react';
import { DURATION } from './timeline';

/**
 * Single master clock. Every panel (both 3D scenes and the software UI) derives
 * its state from `sim.t`, so the three views can never drift apart.
 *  - t:    position on the 75s demo timeline (seekable, loops)
 *  - wall: ambient time that only advances while playing (drones, cranes, idle motion)
 */
export const sim = {
  t: 0,
  wall: 0,
  playing: true,
  loop: true,
};

type Listener = () => void;
const listeners = new Set<Listener>();
let coarseT = 0; // quantised copy for React UI (10 Hz)
let snapshot = { t: 0, playing: true };

function emit() {
  snapshot = { t: coarseT, playing: sim.playing };
  listeners.forEach((l) => l());
}

let last = performance.now();
function tick(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (sim.playing) {
    sim.t += dt;
    sim.wall += dt;
    if (sim.t >= DURATION) sim.t = sim.loop ? sim.t - DURATION : DURATION;
  }
  const q = Math.floor(sim.t * 10) / 10;
  if (q !== coarseT) {
    coarseT = q;
    emit();
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

export const clock = {
  play() {
    sim.playing = true;
    emit();
  },
  pause() {
    sim.playing = false;
    emit();
  },
  toggle() {
    sim.playing ? clock.pause() : clock.play();
  },
  seek(t: number) {
    sim.t = Math.max(0, Math.min(DURATION - 0.01, t));
    coarseT = Math.floor(sim.t * 10) / 10;
    emit();
  },
};

function subscribe(l: Listener) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** React hook: timeline position (10 Hz resolution) + play state. */
export function useClock() {
  return useSyncExternalStore(subscribe, () => snapshot);
}
