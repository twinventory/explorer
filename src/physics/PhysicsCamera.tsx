import { useLayoutEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { Box3, Vector3, type PerspectiveCamera } from 'three';
import type { OrbitControls } from 'three-stdlib';
import type { Simulation } from './simulation';

/** Frame the authored experiment once, not its changing simulation bounds. */
export function PhysicsCamera({ simulation, active }: { simulation: Simulation; active: boolean }) {
  const { camera, size, get, invalidate } = useThree();
  useLayoutEffect(() => {
    if (!active || !simulation.bodies.length) return;
    const bounds = new Box3();
    for (const { definition: d } of simulation.bodies) {
      const center = new Vector3(...d.position), radius = new Vector3(...d.dimensions).length()/2;
      bounds.expandByPoint(center.clone().addScalar(radius));
      bounds.expandByPoint(center.clone().addScalar(-radius));
    }
    const center = bounds.getCenter(new Vector3());
    const radius = bounds.getSize(new Vector3()).length()/2;
    const vertical = (camera as PerspectiveCamera).fov * Math.PI/360;
    const angle = Math.min(vertical, Math.atan(Math.tan(vertical) * size.width/size.height));
    const distance = radius / Math.sin(angle) * 1.4;
    camera.position.copy(center).addScaledVector(new Vector3(1, .7, 1.4).normalize(), distance);
    camera.lookAt(center);
    const controls = get().controls as OrbitControls | null;
    if (controls?.target) { controls.target.copy(center); controls.update(); }
    invalidate();
  }, [simulation, active, camera, size.width, size.height, get, invalidate]);
  return null;
}
