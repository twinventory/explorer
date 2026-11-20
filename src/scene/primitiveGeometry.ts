import { deformBufferGeometry } from './deformationGeometry';
import { compileDeformation, localDeformationFrame } from '../model/deformation';
import { partitionGridGeometry } from './partitionGridGeometry';
import { Vector3, BoxGeometry, ConeGeometry, CylinderGeometry, SphereGeometry, type BufferGeometry } from 'three';
import { RoundedBoxGeometry as RoundedBufferBoxGeometry } from 'three-stdlib';
import type { SpatialGeometry } from '../model/geometry';

const COMPACT_STRENGTH_MAX = 5;

export function normalizedXyzDslStrength(value?: number): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  return Math.min(Math.max(value, 0), COMPACT_STRENGTH_MAX) / COMPACT_STRENGTH_MAX;
}

export function normalizedRoundedBoxRadius(geometry: SpatialGeometry): number {
  const radius = geometry['box-radius'] ?? 0;
  const puff = normalizedXyzDslStrength(geometry.puff) ?? 0;

  if (radius <= 0 && puff <= 0) {
    return 0;
  }

  const smallestDimension = Math.min(...geometry.dimensions);

  if (smallestDimension <= 0) {
    return 0;
  }

  const puffRadius = puff * smallestDimension * 0.28;
  const clampedRadius = Math.min(Math.max(radius, puffRadius), smallestDimension / 2);

  return clampedRadius / smallestDimension;
}

function baseGeometry(geometry: SpatialGeometry): BufferGeometry {
  if (geometry.partitionGrid) return partitionGridGeometry(geometry.partitionGrid);
  switch (geometry.kind) {
    case 'cylinder':
      return new CylinderGeometry(0.5, 0.5, 1, 48);
    case 'cone':
      return new ConeGeometry(0.5, 1, 48);
    case 'sphere':
      return new SphereGeometry(0.5, 48, 24);
    case 'box': {
      const radius = normalizedRoundedBoxRadius(geometry);

      if (radius > 0) {
        const puff = normalizedXyzDslStrength(geometry.puff) ?? 0;
        const segments = 4 + Math.round(puff * 4);

        return new RoundedBufferBoxGeometry(1, 1, 1, segments, radius);
      }

      return new BoxGeometry(1, 1, 1);
    }
    default:
      return new BoxGeometry(1, 1, 1);
  }
}

export function bufferGeometryForSpatialGeometry(geometry: SpatialGeometry): BufferGeometry {
  const source = baseGeometry(geometry);
  const frames = geometry.deformationFrames ?? (geometry.deformation?.operations.length ? [localDeformationFrame(geometry.dimensions, geometry.deformation)] : []);
  if (!frames.length) return source;
  const operations = geometry.deformation?.operations ?? [];
  let seamAxis: number | undefined;
  const fullBend = operations.find(op => op.kind === 'bend' && Math.abs(op.amount) === 360 && op.range[0] === 0 && op.range[1] === 1);
  if (geometry.kind === 'box' && !normalizedRoundedBoxRadius(geometry) && fullBend) {
    const axis = { x: 0, y: 1, z: 2 }[fullBend.axis];
    const map = compileDeformation(frames);
    const cross = (end: number) => [-.5, .5].flatMap(u => [-.5, .5].map(v => {
      const point = new Vector3().setComponent(axis, end).setComponent((axis + 1) % 3, u).setComponent((axis + 2) % 3, v);
      return map(point);
    }));
    const ends = cross(.5);
    if (cross(-.5).every(p => ends.some(q => p.distanceToSquared(q) < 1e-14))) seamAxis = axis;
  }
  try {
    return deformBufferGeometry(source, frames, seamAxis);
  } finally { source.dispose(); }
}
