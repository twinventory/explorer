import { describe, expect, it } from 'vitest';
import { localTextureCatalog, localTextureMaps } from './library';
import { validateTextureSource, resolveTextureVariants, textureSlots } from '../model/textureVariants';
import { createSpatialDocument } from '../model/createSpatialDocument';

describe('bundled texture library', () => {
  it('includes every map for every catalog entry in the build', () => {
    for (const name of Object.keys(localTextureCatalog)) {
      const source = `local:${name}`;
      expect(validateTextureSource(source)).toBe(source);
      const maps = localTextureMaps(source)!;
      expect(Object.keys(maps).sort()).toEqual([...textureSlots].sort());
      for (const url of Object.values(maps)) expect(url).toMatch(/\.png(?:\?|$)|^data:image\/png/);
      expect(new Set(Object.values(maps)).size).toBe(4);
    }
  });
  it('inherits the local oak declaration', () => {
    const document = createSpatialDocument('"Oak/" : "texture: local:oak"\n"Oak/+0+2/+0+1d/+0+1" : ""');
    expect(document.diagnostics).toEqual([]);
    expect(document.renderNodes[0].material.texture).toBe('local:oak');
  });
  it('rejects unknown entries and traversal before rendering', () => {
    for (const source of ['local:missing', 'local:../oak', 'local:oak.png', 'local:constructor']) {
      expect(() => validateTextureSource(source)).toThrow('Unknown local texture');
    }
  });
  it('keeps remote declarations on the remote resolution path', () => {
    expect(localTextureMaps('materials/oak.png')).toBeUndefined();
    expect(resolveTextureVariants('materials/oak.png', 'https://store.example/').map).toBe('https://store.example/materials/oak.map.png');
    expect(() => resolveTextureVariants('local:oak', 'https://store.example/')).toThrow('bundled library');
  });
});
