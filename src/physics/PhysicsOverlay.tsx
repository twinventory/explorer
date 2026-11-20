import { Line } from '@react-three/drei';
import { Vector3 } from 'three';
import type { Simulation } from './simulation';
export function PhysicsOverlay({ simulation }: { simulation: Simulation }) {
  return <>{simulation.bodies.length > 0 && <><ambientLight intensity={.7} /><directionalLight position={[4, 6, 3]} intensity={2} /></>}{simulation.bodies.map(b => {
    const magnitude = b.force.length();
    return <group key={b.definition.id}>
      {magnitude > 1e-10 && <arrowHelper args={[b.force.clone().normalize(), b.position.clone().addScaledVector(b.force.clone().normalize(), new Vector3(...b.definition.dimensions).length()/2), Math.min(.8, magnitude * .04), 0xffcc44, .06, .035]} />}
      {b.trail.length > 1 && <Line points={b.trail.map(p => new Vector3(...p))} color="#77caff" lineWidth={1} raycast={() => {}} />}
    </group>;
  })}</>;
}
