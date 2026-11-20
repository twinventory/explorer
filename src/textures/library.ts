import catalog from './catalog.json';
import type { TextureSlot } from '../model/textureVariants';

// Vite emits these source assets into both the browser and desktop builds.
const images = import.meta.glob('./*/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const suffixes: Record<TextureSlot, string> = { map: 'map', normalMap: 'normal', roughnessMap: 'roughness', metalnessMap: 'metalness' };
export const localTextureCatalog = catalog;

export function localTextureMaps(source: string): Record<TextureSlot, string> | undefined {
  if (!source.startsWith('local:')) return undefined;
  const name = source.slice('local:'.length);
  if (!Object.hasOwn(catalog, name)) throw Error(`Unknown local texture "${name}".`);
  return Object.fromEntries(Object.entries(suffixes).map(([slot, suffix]) => {
    const url = images[`./${name}/${name}.${suffix}.png`];
    if (!url) throw Error(`Local texture "${name}" is missing its ${suffix} map.`);
    return [slot, url];
  })) as Record<TextureSlot, string>;
}
