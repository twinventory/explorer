import { expect, it } from 'vitest';
import { MeshStandardMaterial, Texture } from 'three';
import { updateTextureMaterial } from './textureMaterial';
import { createSpatialDocument } from '../model/createSpatialDocument';
import { bufferGeometryForSpatialGeometry } from './primitiveGeometry';

it('refreshes shader defines as maps arrive or disappear, without recompiling unchanged maps', () => {
  const material = new MeshStandardMaterial();
  updateTextureMaterial(material);
  let version = material.version;
  for (const slot of ['map', 'normalMap', 'roughnessMap', 'metalnessMap'] as const) {
    material[slot] = new Texture();
    updateTextureMaterial(material);
    expect(material.version).toBe(++version);
    updateTextureMaterial(material);
    expect(material.version).toBe(version);
  }
  material.map = null;
  updateTextureMaterial(material);
  expect(material.version).toBe(++version);
  material.normalMap!.channel = 1;
  updateTextureMaterial(material);
  expect(material.version).toBe(++version);
});

it('retains oak and usable UVs on the reported twisted object', () => {
  const document = createSpatialDocument('"Twist/+2+141c/+0+12c/+1+12c" : "twist: x,180; texture: local:oak"');
  expect(document.diagnostics).toEqual([]);
  const node = document.renderNodes[0];
  expect(node.material.texture).toBe('local:oak');
  const geometry = bufferGeometryForSpatialGeometry(node.geometry);
  try {
    const uv = geometry.getAttribute('uv');
    expect(uv.count).toBe(geometry.getAttribute('position').count);
    const values = Array.from(uv.array);
    expect(values.every(Number.isFinite)).toBe(true);
    expect(Math.min(...values)).toBeCloseTo(0);
    expect(Math.max(...values)).toBeCloseTo(1);
  } finally { geometry.dispose(); }
});
