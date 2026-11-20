import { Euler, Quaternion, Vector3 } from 'three';
import type { SpatialNode } from '../model/SpatialNode';
import { matrixFromTransform } from '../model/transform';
import type { SpatialObject, ParseDiagnostic } from '../xyzdsl/types';
import type { ResolvedSpatialObject } from '../xyzdsl/resolveDocument';
import type { ForceAction, Triple } from '../xyzdsl/physicsParser';
export interface CompiledForce { vector: Triple; offset: Triple; duration: number }
export interface BodyDefinition { id: string; name: string; mass: number; position: Triple; rotation: Triple; dimensions: Triple; gravity: Triple; actions: CompiledForce[] }
export interface PhysicsDefinition { bodies: BodyDefinition[] }

export function compilePhysics(parsed: SpatialObject[], resolved: ResolvedSpatialObject[], nodes: SpatialNode[], diagnostics: ParseDiagnostic[]): PhysicsDefinition {
  const flat = (list: SpatialNode[]): SpatialNode[] => list.flatMap(n => [n, ...flat(n.children ?? [])]);
  const all = flat(nodes), byId = new Map(all.map(n => [n.id, n]));
  const parents = new Map<string, SpatialNode>();
  const collectParents = (list: SpatialNode[]) => {
    for (const node of list) for (const child of node.children ?? []) { parents.set(child.id, node); collectParents([child]); }
  };
  collectParents(nodes);
  const objects = new Map(resolved.map(o => [o.id, o]));
  const byPath = new Map(all.filter(n => n.namespacePath).map(n => [n.namespacePath!, n]));
  const bodies: BodyDefinition[] = [];
  const report = (object: SpatialObject, message: string) => diagnostics.push({ line: object.lineNumber, source: object.source, message });
  for (const object of resolved) {
    if (!object.physics?.body) continue;
    const node = byId.get(object.id)!;
    const ancestors: SpatialNode[] = [];
    let parent = parents.get(node.id);
    while (parent) { ancestors.push(parent); parent = parents.get(parent.id); }
    const family = [node, ...ancestors];
    const unsupported = !node.renderable || node.children?.length || node.geometry.kind !== 'box' || node.model || node.content?.kind || node.light || node.metadata?.viewPoint || node.csgExpressionId || node.csgConsumed || node.geometry.operation || node.geometry['box-radius'] || node.geometry.puff || node.geometry.partitionGrid || node.geometry.deformationFrames?.length || node.clippingPlanes?.length || family.some(n => {
      const o = objects.get(n.id);
      return o?.reference.targetPath || o?.materializedFrom || o?.repeat || o?.repeatSourceId || o?.surface || o?.cell || o?.boxSurface || (n !== node && o?.physics?.body);
    });
    // Nonuniform parent scaling plus rotation can introduce shear, which is not a rigid frame.
    const scaledParent = ancestors.some(n => n.transform.scale.some(s => Math.abs(s - 1) > 1e-8));
    if (unsupported || scaledParent || node.transform.scale.some(s => !Number.isFinite(s) || s <= 0)) {
      report(object, 'Physics currently supports plain rigid box leaves under unscaled components, without refs, repetition, surfaces, CSG, deformation, or nested bodies.');
      continue;
    }
    const gravityOwner = family.find(n => objects.get(n.id)?.physics?.gravity);
    const gravity = new Vector3(...(gravityOwner ? objects.get(gravityOwner.id)!.physics!.gravity! : [0, -9.81, 0] as Triple));
    // Gravity is a field fixed in the declaring component's initial orientation.
    if (gravityOwner) gravity.applyQuaternion(new Quaternion().setFromEuler(new Euler(...gravityOwner.transform.rotation)));
    bodies.push({ id: node.id, name: node.namespacePath?.replace(/\/$/, '') ?? node.id, mass: object.physics.body.mass, position: [...node.transform.position], rotation: [...node.transform.rotation], dimensions: [...node.transform.scale], gravity: gravity.toArray(), actions: [] });
  }
  for (const object of parsed) {
    const action: ForceAction | undefined = object.physics?.action;
    if (!action) continue;
    const path = object.namespace.join('/') + '/';
    const node = byPath.get(path), body = bodies.find(b => b.id === node?.id);
    if (!body || !node) { report(object, 'Force action must address an existing supported rigid body.'); continue; }
    const parent = parents.get(node.id);
    const vector = new Vector3(...action.vector);
    if (parent) vector.applyQuaternion(new Quaternion().setFromEuler(new Euler(...parent.transform.rotation)));
    const offset = new Vector3();
    if (Array.isArray(action.point)) {
      offset.set(...action.point);
      if (parent) offset.applyMatrix4(matrixFromTransform(parent.transform));
      offset.sub(new Vector3(...body.position)).applyQuaternion(new Quaternion().setFromEuler(new Euler(...body.rotation)).invert());
    }
    if (typeof action.point === 'string') {
      // Face centers follow the body's own axes, matching XYZDSL surface names.
      const [x, y, z] = body.dimensions;
      const faces: Record<string, Triple> = { center: [0,0,0], left: [-x/2,0,0], right: [x/2,0,0], bottom: [0,-y/2,0], top: [0,y/2,0], front: [0,0,-z/2], back: [0,0,z/2] };
      offset.set(...faces[action.point]);
    }
    body.actions.push({ vector: vector.toArray(), offset: offset.toArray(), duration: action.duration });
  }
  return { bodies };
}
