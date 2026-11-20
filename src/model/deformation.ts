import { Matrix4, Vector3 } from 'three';
import type { DeformationOperation, DeformationSpec } from '../xyzdsl/deformation';

export type Triple = [number, number, number];
export interface DeformationFrame {
  dimensions: Triple;
  spec: DeformationSpec;
  /** Normalized mesh coordinates to the owner's physical, centred local frame. */
  toFrame: number[];
  fromFrame: number[];
}
const axes = { x: 0, y: 1, z: 2 } as const;
const clamp = (t: number) => Math.max(0, Math.min(1, t));
const smooth = (t: number) => t * t * (3 - 2 * t);
const N = 512;
function integral(fn: (t: number) => number) {
  const values = [0];
  for (let i = 1; i <= N; i++) {
    const a = (i - 1) / N, b = i / N;
    values.push(values[i - 1] + (fn(a) + 4 * fn((a + b) / 2) + fn(b)) / (6 * N));
  }
  return (t: number) => {
    const x = clamp(t) * N, i = Math.min(N - 1, Math.floor(x));
    return values[i] + (values[i + 1] - values[i]) * (x - i);
  };
}

function compileOperation(op: DeformationOperation, dims: Triple, spec: DeformationSpec) {
  const a = axes[op.axis], b = op.toward ? axes[op.toward] : (a + 1) % 3;
  const start = dims[a] * (op.range[0] - .5), extent = dims[a] * (op.range[1] - op.range[0]);
  const radians = op.amount * Math.PI / 180;
  const progress = spec.profile === 'smooth' ? smooth : (t: number) => t;
  const angle = (t: number) => radians * progress(t);
  const cosIntegral = op.kind === 'bend' && spec.profile === 'smooth' ? integral(t => Math.cos(angle(t))) : undefined;
  const sinIntegral = op.kind === 'bend' && spec.profile === 'smooth' ? integral(t => Math.sin(angle(t))) : undefined;
  // Unit strain at section boundaries, strictly positive even for strong
  // compression. Analytic integrals retain the exact requested length factor.
  const smoothStrain = spec.profile === 'smooth' || (spec.volume === 'preserve' && (op.range[0] > 0 || op.range[1] < 1));
  const strain = (t: number) => !smoothStrain ? op.amount : op.amount >= 1
    ? 1 + 2 * (op.amount - 1) * Math.sin(Math.PI * t) ** 2
    : 1 / (1 + (1 / op.amount ** 2 - 1) * Math.sin(Math.PI * t) ** 2);
  const stretchIntegral = (t: number) => {
    if (!smoothStrain) return op.amount * t;
    if (op.amount >= 1) return t + (op.amount - 1) * (t - Math.sin(2 * Math.PI * t) / (2 * Math.PI));
    if (t === .5) return op.amount / 2;
    return op.amount / Math.PI * (Math.atan(Math.tan(Math.PI * t) / op.amount) + (t > .5 ? Math.PI : 0));
  };
  const crossScale = (t: number) => op.kind === 'bulge'
    ? 1 + (op.amount - 1) * Math.sin(Math.PI * t) ** 2
    : 1 + (op.amount - 1) * progress(t);
  const compensation = spec.volume === 'preserve' && ['taper', 'bulge'].includes(op.kind)
    ? integral(t => 1 / crossScale(t) ** 2) : undefined;
  return (p: Triple, original: Triple): Triple => {
    const s = original[a], u = (s - start) / extent, t = clamp(u);
    if (u < 0) return p;
    const result: Triple = [...p];
    const tail = Math.max(0, s - start - extent);
    switch (op.kind) {
      case 'bend': {
        if (Math.abs(radians) < 1e-12) return p;
        const theta = angle(t), c = Math.cos(theta), sn = Math.sin(theta);
        const x = cosIntegral ? extent * cosIntegral(t) : extent / radians * sn;
        const y = sinIntegral ? extent * sinIntegral(t) : extent / radians * (1 - c);
        const longitudinal = p[a] - s + tail;
        result[a] = start + x + c * longitudinal - sn * p[b];
        result[b] = y + sn * longitudinal + c * p[b];
        break;
      }
      case 'twist': {
        // Cyclic axes give right-handed rotation about +X, +Y and +Z.
        const j = (a + 1) % 3, k = (a + 2) % 3, theta = angle(t);
        result[j] = Math.cos(theta) * p[j] - Math.sin(theta) * p[k];
        result[k] = Math.sin(theta) * p[j] + Math.cos(theta) * p[k];
        break;
      }
      case 'stretch': {
        result[a] += extent * (stretchIntegral(t) - t);
        if (spec.volume === 'preserve' && u <= 1) {
          const scale = 1 / Math.sqrt(strain(t));
          for (let j = 0; j < 3; j++) if (j !== a) result[j] *= scale;
        }
        break;
      }
      case 'taper': case 'bulge': {
        const scale = crossScale(t);
        for (let j = 0; j < 3; j++) if (j !== a) result[j] *= scale;
        if (compensation) result[a] += extent * (compensation(t) - t) + tail * (1 / scale ** 2 - 1);
        break;
      }
      case 'shear': result[b] += op.amount * progress(t); break;
      case 'offset': result[b] += op.amount * smooth(t); break;
      case 'wave': result[b] += op.amount * Math.sin(2 * Math.PI * op.cycles! * t) * (spec.profile === 'smooth' ? Math.sin(Math.PI * t) ** 2 : 1); break;
    }
    return result;
  };
}

/** Original material coordinates survive every operation and every parent frame. */
export function compileDeformation(frames: DeformationFrame[]) {
  const compiled = frames.map(frame => ({
    to: new Matrix4().fromArray(frame.toFrame), from: new Matrix4().fromArray(frame.fromFrame),
    operations: frame.spec.operations.map(op => compileOperation(op, frame.dimensions, frame.spec)),
  }));
  return (point: Vector3, target = new Vector3()): Vector3 => {
    target.copy(point);
    for (const frame of compiled) {
      const original = point.clone().applyMatrix4(frame.to).toArray() as Triple;
      let current = target.applyMatrix4(frame.to).toArray() as Triple;
      for (const operation of frame.operations) current = operation(current, original);
      target.fromArray(current).applyMatrix4(frame.from);
    }
    return target;
  };
}

export function localDeformationFrame(dimensions: Triple, spec: DeformationSpec): DeformationFrame {
  const matrix = new Matrix4().makeScale(...dimensions);
  return { dimensions, spec, toFrame: matrix.toArray(), fromFrame: matrix.clone().invert().toArray() };
}

/** Recognize only the analytically separated, full-length Archimedean spiral.
 * At each polar angle the cross-section is a radial interval. Adjacent turns
 * are disjoint when radial pitch exceeds that interval's thickness and the
 * innermost radius remains positive. Other chains retain the general warning. */
function separatedSpiral(spec: DeformationSpec, dimensions: Triple): boolean {
  if (spec.profile !== 'linear' || spec.operations.length !== 2) return false;
  const [shear, bend] = spec.operations;
  if (shear.kind !== 'shear' || bend.kind !== 'bend' || shear.axis !== bend.axis || shear.toward !== bend.toward) return false;
  if (spec.operations.some(op => op.range[0] !== 0 || op.range[1] !== 1)) return false;
  if (shear.amount * bend.amount >= 0) return false; // Must expand away from the bend centre.
  const turns = Math.abs(bend.amount) / 360;
  const thickness = dimensions[axes[bend.toward!]];
  const radius = dimensions[axes[bend.axis]] / (turns * 2 * Math.PI);
  const pitch = Math.abs(shear.amount) / turns;
  const tolerance = 1e-9 * Math.max(thickness, radius, pitch);
  return radius > thickness / 2 + tolerance && pitch > thickness + tolerance;
}

export function deformationDiagnostics(spec: DeformationSpec, dimensions: Triple): string[] {
  const messages: string[] = [];
  for (const op of spec.operations) {
    if (op.kind !== 'bend' || !op.amount) continue;
    const length = dimensions[axes[op.axis]] * (op.range[1] - op.range[0]);
    const peakCurvature = Math.abs(op.amount * Math.PI / 180) / length * (spec.profile === 'smooth' ? 1.5 : 1);
    if (peakCurvature * dimensions[axes[op.toward!]] / 2 >= 1) messages.push('Bend radius reaches or crosses the inner surface; the section may fold through itself. Reduce the angle or thickness, or widen the interval.');
    if (Math.abs(op.amount) > 360 && !separatedSpiral(spec, dimensions)) messages.push('A bend beyond 360 degrees can overlap itself.');
  }
  return messages;
}
