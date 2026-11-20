import { BufferGeometry, Float32BufferAttribute, Matrix4, Vector3 } from 'three';
import { compileDeformation, type DeformationFrame } from '../model/deformation';

const MAX_VERTICES = 600000;
const AXES = { x: 0, y: 1, z: 2 } as const;
type Vertex = number[];
interface Plane { matrix: Matrix4; axis: number; cuts: number[] }

function slicingPlanes(frames: DeformationFrame[]): Plane[] {
  return frames.flatMap(frame => {
    const byAxis = new Map<number, Set<number>>();
    for (const op of frame.spec.operations) {
      const axis = AXES[op.axis];
      const cuts = byAxis.get(axis) ?? new Set<number>();
      const factorSteps = ['stretch', 'taper', 'bulge'].includes(op.kind) ? Math.ceil(32 * Math.sqrt(Math.max(op.amount, 1 / op.amount))) : 32;
      const steps = Math.max(factorSteps, Math.ceil(Math.abs(['bend', 'twist'].includes(op.kind) ? op.amount : 0) / 5), (op.cycles ?? 1) * 24);
      for (let i = 0; i <= steps; i++) cuts.add(frame.dimensions[axis] * (op.range[0] + (op.range[1] - op.range[0]) * i / steps - .5));
      byAxis.set(axis, cuts);
    }
    return [...byAxis].map(([axis, cuts]) => ({ matrix: new Matrix4().fromArray(frame.toFrame), axis, cuts: [...cuts].sort((a, b) => a - b) }));
  });
}

/** Slice triangles in original material coordinates, including exact interval
 * boundaries. Interpolate all UV/color attributes and preserve material groups. */
export function deformBufferGeometry(source: BufferGeometry, frames: DeformationFrame[], openEndsAxis?: number): BufferGeometry {
  if (!frames.some(frame => frame.spec.operations.length)) return source.clone();
  const attributes = Object.entries(source.attributes).filter(([name]) => name !== 'tangent');
  const positionOffset = attributes.slice(0, attributes.findIndex(([name]) => name === 'position')).reduce((sum, [, a]) => sum + a.itemSize, 0);
  const stride = attributes.reduce((sum, [, a]) => sum + a.itemSize, 0);
  const values: number[][] = attributes.map(() => []);
  const groups: { start: number; count: number; materialIndex: number }[] = [];
  const slices = slicingPlanes(frames);
  const point = (v: Vertex) => new Vector3(v[positionOffset], v[positionOffset + 1], v[positionOffset + 2]);
  const coordinate = (v: Vertex, plane: Plane) => point(v).applyMatrix4(plane.matrix).getComponent(plane.axis);
  let count = 0;
  function emit(polygon: Vertex[], material: number) {
    for (let i = 1; i + 1 < polygon.length; i++) {
      if (count + 3 > MAX_VERTICES) throw Error('Deformation exceeds the 200,000 triangle budget per mesh. Reduce operations or model detail.');
      for (const v of [polygon[0], polygon[i], polygon[i + 1]]) {
        let offset = 0;
        attributes.forEach(([, attr], j) => { for (let k = 0; k < attr.itemSize; k++) values[j].push(v[offset++]); });
      }
      const last = groups.at(-1);
      if (last?.materialIndex === material) last.count += 3;
      else groups.push({ start: count, count: 3, materialIndex: material });
      count += 3;
    }
  }
  function slice(polygon: Vertex[], planeIndex: number, material: number): void {
    if (planeIndex === slices.length) { emit(polygon, material); return; }
    const plane = slices[planeIndex];
    const coords = polygon.map(v => coordinate(v, plane));
    const min = Math.min(...coords), max = Math.max(...coords);
    const cuts = plane.cuts.filter(c => c > min + 1e-10 && c < max - 1e-10);
    if (!cuts.length) { slice(polygon, planeIndex + 1, material); return; }
    const cut = cuts[Math.floor(cuts.length / 2)];
    const low: Vertex[] = [], high: Vertex[] = [];
    for (let i = 0; i < polygon.length; i++) {
      const v = polygon[i], next = polygon[(i + 1) % polygon.length];
      const d = coords[i] - cut, nd = coords[(i + 1) % polygon.length] - cut;
      if (d <= 1e-10) low.push(v);
      if (d >= -1e-10) high.push(v);
      if ((d < -1e-10 && nd > 1e-10) || (d > 1e-10 && nd < -1e-10)) {
        const t = d / (d - nd);
        const intersection = Array.from({ length: stride }, (_, k) => v[k] + (next[k] - v[k]) * t);
        low.push(intersection); high.push(intersection);
      }
    }
    if (low.length >= 3) slice(low, planeIndex, material);
    if (high.length >= 3) slice(high, planeIndex, material);
  }
  const vertexCount = source.index?.count ?? source.attributes.position.count;
  for (let i = 0; i < vertexCount; i += 3) {
    const vertices = [0, 1, 2].map(k => {
      const index = source.index ? source.index.getX(i + k) : i + k;
      return attributes.flatMap(([, attr]) => Array.from({ length: attr.itemSize }, (_, component) => attr.getComponent(index, component)));
    });
    // A closed full-circle box has no internal end caps. UV seams remain split,
    // but paired boundary positions and normals coincide geometrically.
    if (openEndsAxis !== undefined && [-.5, .5].some(end => vertices.every(v => Math.abs(point(v).getComponent(openEndsAxis) - end) < 1e-7))) continue;
    const material = source.groups.find(group => i >= group.start && i < group.start + group.count)?.materialIndex ?? 0;
    slice(vertices, 0, material);
  }
  const result = new BufferGeometry();
  attributes.forEach(([name, attr], i) => result.setAttribute(name, new Float32BufferAttribute(values[i], attr.itemSize)));
  for (const group of groups) result.addGroup(group.start, group.count, group.materialIndex);
  result.computeBoundingBox();
  const sourceBounds = result.boundingBox!.clone();
  const map = compileDeformation(frames);
  const position = result.attributes.position, normal = result.attributes.normal;
  const input = new Vector3(), output = new Vector3();
  const e = 1e-5;
  const derivatives = [new Vector3(), new Vector3(), new Vector3()];
  for (let i = 0; i < position.count; i++) {
    input.fromBufferAttribute(position, i);
    map(input, output);
    if (!output.toArray().every(Number.isFinite)) throw Error('Deformation produced non-finite geometry.');
    if (normal) {
      for (let axis = 0; axis < 3; axis++) {
        const low = Math.max(sourceBounds.min.getComponent(axis), input.getComponent(axis) - e);
        const high = Math.min(sourceBounds.max.getComponent(axis), input.getComponent(axis) + e);
        const plus = input.clone().setComponent(axis, high);
        const minus = input.clone().setComponent(axis, low);
        if (high > low) derivatives[axis].copy(map(plus)).sub(map(minus)).multiplyScalar(1 / (high - low));
        else {
          // Flat imported surfaces still need the normal-direction derivative.
          plus.setComponent(axis, input.getComponent(axis) + e);
          minus.setComponent(axis, input.getComponent(axis) - e);
          derivatives[axis].copy(map(plus)).sub(map(minus)).multiplyScalar(1 / (2 * e));
        }
      }
      const n = new Vector3().fromBufferAttribute(normal, i);
      const transformed = derivatives[1].clone().cross(derivatives[2]).multiplyScalar(n.x)
        .add(derivatives[2].clone().cross(derivatives[0]).multiplyScalar(n.y))
        .add(derivatives[0].clone().cross(derivatives[1]).multiplyScalar(n.z)).normalize();
      normal.setXYZ(i, transformed.x, transformed.y, transformed.z);
    }
    position.setXYZ(i, output.x, output.y, output.z);
  }
  if (!normal) result.computeVertexNormals();
  result.computeBoundingBox(); result.computeBoundingSphere();
  return result;
}
