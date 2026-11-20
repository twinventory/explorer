import type { XyzDslPropertyDeclaration } from './propertyParser';
export type Triple = [number, number, number];
export const NAMED_POINTS = ['center', 'left', 'right', 'bottom', 'top', 'front', 'back'] as const;
export type NamedPoint = typeof NAMED_POINTS[number];
export interface ForceAction { vector: Triple; point: NamedPoint | Triple; duration: number }
export interface PhysicsProperties { body?: { mass: number }; gravity?: Triple; action?: ForceAction }
export const PHYSICS_PROPERTIES = ['body', 'mass', 'gravity', 'action', 'vector', 'point', 'duration'];

export function parsePhysicsProperties(declarations: XyzDslPropertyDeclaration[]): PhysicsProperties {
  const values = new Map(declarations.map(d => [d.property, d.value]));
  const has = (key: string) => values.has(key);
  const number = (raw: string, length = false): number => {
    const match = raw.trim().match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)([dcm]?)$/i);
    if (!match || (!length && match[2])) throw Error('Physics values must be finite numbers; only points accept length suffixes.');
    const n = Number(match[1]) / ({ d: 10, c: 100, m: 1000 }[match[2]] ?? 1);
    if (!Number.isFinite(n)) throw Error('Physics values must be finite.');
    return n;
  };
  const triple = (raw: string, length = false): Triple => {
    const parts = raw.split(',');
    if (parts.length !== 3) throw Error('Physics vectors and points require three comma-separated values.');
    return parts.map(p => number(p, length)) as Triple;
  };
  const result: PhysicsProperties = {};
  if (has('action')) {
    if (values.get('action') !== 'force') throw Error('Only action: force is supported.');
    if (declarations.some(d => !['action', 'vector', 'point', 'duration'].includes(d.property))) throw Error('Action declarations cannot also declare geometry, body properties, or defaults.');
    if (!has('vector') || !has('duration')) throw Error('A force action requires vector and duration.');
    const duration = number(values.get('duration')!);
    if (duration <= 0) throw Error('Action duration must be positive seconds.');
    const point = values.get('point') ?? 'center';
    result.action = { vector: triple(values.get('vector')!), duration, point: NAMED_POINTS.includes(point as NamedPoint) ? point as NamedPoint : triple(point, true) };
    return result;
  }
  if (['vector', 'point', 'duration'].some(has)) throw Error('vector, point, and duration require action: force.');
  if (has('body')) {
    if (values.get('body') !== 'rigid') throw Error('Only body: rigid is supported.');
    if (!has('mass')) throw Error('A rigid body requires mass in kilograms.');
    const mass = number(values.get('mass')!);
    if (mass <= 0) throw Error('Mass must be positive kilograms.');
    result.body = { mass };
  } else if (has('mass')) throw Error('mass requires body: rigid on the same declaration.');
  if (has('gravity')) result.gravity = triple(values.get('gravity')!);
  return result;
}
