import { describe, it, expect } from 'vitest';
import { resolveTextureVariants, validateTextureSource } from './textureVariants';
import { createSpatialDocument } from './createSpatialDocument';

describe('texture sets', () => {
  it('resolves short names with the configured store and preserves URL queries', () => {
    expect(resolveTextureVariants('wood.png', 'https://store.example/materials/')).toEqual({
      map: 'https://store.example/materials/wood.map.png', normalMap: 'https://store.example/materials/wood.normal.png',
      roughnessMap: 'https://store.example/materials/wood.roughness.png', metalnessMap: 'https://store.example/materials/wood.metalness.png',
    });
    expect(resolveTextureVariants('https://other.example/wood.normal.jpg?v=2', 'https://store.example/').map).toBe('https://other.example/wood.map.jpg?v=2');
  });
  it('rejects unsupported protocols, credentials, formats and escaped traversal', () => {
    for (const source of ['../wood.png', '%2e%2e/wood.png', '//host/wood.png', 'file:///wood.png', 'https://user:pass@host/wood.png', 'wood.svg', 'x%5cwood.png']) expect(() => validateTextureSource(source)).toThrow();
  });
  it('inherits texture sets and allows child overrides', () => {
    const source = '"Surface/" : "texture: wood.png"\n"Surface/+0+1/+0+1/+0+1" : "color: white"';
    expect(createSpatialDocument(source).renderNodes[0].material.texture).toBe('wood.png');
    expect(createSpatialDocument(source.replace('color: white', 'texture: stone.webp')).renderNodes[0].material.texture).toBe('stone.webp');
  });
});
