import { useEffect, useMemo, useState } from 'react';
import type { SpatialDocument } from '../model/SpatialDocument';
import { Simulation } from './simulation';

export function useSimulation(source: SpatialDocument) {
  const simulation = useMemo(() => new Simulation(source.physics ?? { bodies: [] }), [source]);
  const [session, setSession] = useState({ simulation, playing: false, revision: 0 });
  const playing = session.simulation === simulation && session.playing;
  const refresh = (running = playing) => setSession(previous => ({ simulation, playing: running, revision: previous.revision + 1 }));
  useEffect(() => {
    if (!playing) return;
    let frame = 0, last: number | undefined, accumulator = 0;
    const animate = (now: number) => {
      accumulator += last === undefined ? 0 : Math.min((now - last) / 1000, .1);
      last = now;
      while (accumulator >= 1/120) { simulation.step(); accumulator -= 1/120; }
      setSession(previous => ({ ...previous, revision: previous.revision + 1 }));
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [simulation, playing]);
  const document = useMemo(() => simulation.bodies.length ? simulation.document(source) : source, [source, simulation, session]);
  return { simulation, document, playing, toggle: () => refresh(!playing), step: () => { simulation.step(); refresh(false); }, reset: () => {
    const initial = new Simulation(source.physics ?? { bodies: [] });
    simulation.time = 0; simulation.bodies = initial.bodies; refresh(false);
  } };
}
