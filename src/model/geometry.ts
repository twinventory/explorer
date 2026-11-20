import type { XyzDslBoxSpec, XyzDslCsgOperation, XyzDslGeometrySpec } from '../xyzdsl/types';

export interface SpatialGeometry {
  deformation?: import('../xyzdsl/deformation').DeformationSpec;
  deformationFrames?: import('./deformation').DeformationFrame[];
  partitionGrid?: import('../xyzdsl/boxGrid').GridLayout;
  kind: XyzDslGeometrySpec['kind'];
  dimensions: [number, number, number];
  'box-radius'?: number;
  puff?: number;
  operation?: XyzDslCsgOperation;
}

export function geometryFromBox(box: XyzDslBoxSpec, spec: XyzDslGeometrySpec): SpatialGeometry {
  return {
    kind: spec.kind,
    ...(spec.deformation ? { deformation: spec.deformation } : {}),
    dimensions: [box.width, box.height, box.depth],
    ...(spec['box-radius'] === undefined ? {} : { 'box-radius': spec['box-radius'] }),
    ...(spec.puff === undefined ? {} : { puff: spec.puff }),
    ...(spec.operation === undefined ? {} : { operation: spec.operation }),
  };
}
