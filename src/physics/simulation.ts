import { Euler, Quaternion, Vector3 } from 'three';
import type { SpatialDocument } from '../model/SpatialDocument';
import type { SpatialNode } from '../model/SpatialNode';
import { boundsFromTransformedBox } from '../model/collision';
import type { BodyDefinition, PhysicsDefinition } from './compilePhysics';

export interface BodyState { definition: BodyDefinition; position: Vector3; orientation: Quaternion; velocity: Vector3; momentum: Vector3; angularVelocity: Vector3; inertia: Vector3; force: Vector3; trail: [number, number, number][] }
export class Simulation {
  time = 0;
  bodies: BodyState[];
  constructor(definition: PhysicsDefinition) {
    this.bodies = definition.bodies.map(d => {
      const [x, y, z] = d.dimensions;
      return { definition: d, position: new Vector3(...d.position), orientation: new Quaternion().setFromEuler(new Euler(...d.rotation)), velocity: new Vector3(), momentum: new Vector3(), angularVelocity: new Vector3(), inertia: new Vector3(y*y+z*z, x*x+z*z, x*x+y*y).multiplyScalar(d.mass/12), force: new Vector3(), trail: [[...d.position]] };
    });
    this.updateForces();
  }
  updateForces() {
    for (const b of this.bodies) {
      b.force.set(...b.definition.gravity).multiplyScalar(b.definition.mass);
      for (const a of b.definition.actions) if (this.time < a.duration - 1e-12) b.force.add(new Vector3(...a.vector));
    }
  }
  step(seconds = 1 / 120) {
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    // Split at force end times as well as fixed substeps; impulses do not depend on frame rate.
    const end = this.time + seconds;
    while (this.time < end - 1e-12) {
      let dt = Math.min(1 / 120, end - this.time);
      for (const b of this.bodies) for (const a of b.definition.actions) if (a.duration > this.time + 1e-12) dt = Math.min(dt, a.duration - this.time);
      this.updateForces();
      for (const b of this.bodies) {
        const acceleration = b.force.clone().divideScalar(b.definition.mass);
        b.position.addScaledVector(b.velocity, dt).addScaledVector(acceleration, dt*dt/2);
        b.velocity.addScaledVector(acceleration, dt);
        const torque = new Vector3();
        for (const a of b.definition.actions) if (this.time < a.duration - 1e-12) torque.add(new Vector3(...a.offset).applyQuaternion(b.orientation).cross(new Vector3(...a.vector)));
        // World angular momentum is conserved after a force ends. Evaluate angular
        // velocity through the body-space inertia tensor, including its orientation.
        const angularVelocity = (momentum: Vector3) => momentum.clone().applyQuaternion(b.orientation.clone().invert()).divide(b.inertia).applyQuaternion(b.orientation);
        const omega = angularVelocity(b.momentum.clone().addScaledVector(torque, dt/2));
        const speed = omega.length();
        if (speed > 0) b.orientation.premultiply(new Quaternion().setFromAxisAngle(omega.divideScalar(speed), speed*dt)).normalize();
        b.momentum.addScaledVector(torque, dt);
        b.angularVelocity.copy(angularVelocity(b.momentum));
      }
      this.time += dt;
    }
    this.time = end;
    this.updateForces();
    for (const b of this.bodies) { b.trail.push(b.position.toArray()); if (b.trail.length > 240) b.trail.shift(); }
  }
  document(source: SpatialDocument): SpatialDocument {
    const states = new Map(this.bodies.map(b => [b.definition.id, b]));
    const update = (node: SpatialNode): SpatialNode => {
      const b = states.get(node.id);
      if (!b) return node.children?.length ? { ...node, children: node.children.map(update) } : node;
      const euler = new Euler().setFromQuaternion(b.orientation);
      const transform = { ...node.transform, position: b.position.toArray(), rotation: [euler.x, euler.y, euler.z] as [number, number, number] };
      return { ...node, transform, worldTransform: transform, bounds: boundsFromTransformedBox(node.box, transform) };
    };
    return { ...source, nodes: source.nodes.map(update), renderNodes: source.renderNodes.map(update) };
  }
}
