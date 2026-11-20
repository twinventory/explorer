import type { useSimulation } from './useSimulation';
export function SimulationControls({ runtime }: { runtime: ReturnType<typeof useSimulation> }) {
  if (!runtime.simulation.bodies.length) return null;
  return <section onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()} aria-label="Physics experiment" style={{ position: 'absolute', top: 72, left: 12, maxWidth: 'calc(100% - 24px)', boxSizing: 'border-box', zIndex: 20, background: '#151820ee', color: 'white', padding: 12, borderRadius: 8, maxHeight: '40%', overflow: 'auto', fontSize: 12 }}>
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <button onClick={runtime.toggle}>{runtime.playing ? 'Pause' : 'Play'}</button>
      <button onClick={runtime.step} disabled={runtime.playing}>Step</button>
      <button onClick={runtime.reset}>Reset</button>
      <output>{runtime.simulation.time.toFixed(2)} s</output>
    </div>
    <div>Free motion · no collisions · arrows show net force (direction; length capped)</div>
    {runtime.simulation.bodies.map(b => <div key={b.definition.id}>
      <strong>{b.definition.name}</strong> · {b.definition.mass} kg<br />
      v: {b.velocity.toArray().map(n => n.toFixed(2)).join(', ')} m/s · ω: {b.angularVelocity.toArray().map(n => n.toFixed(2)).join(', ')} rad/s
    </div>)}
  </section>;
}
