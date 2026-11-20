import localTextureCatalog from '../textures/catalog.json';
export const textureSlots = ['map', 'normalMap', 'roughnessMap', 'metalnessMap'] as const;
export type TextureSlot = typeof textureSlots[number];
const suffixes = { map: 'map', normalMap: 'normal', roughnessMap: 'roughness', metalnessMap: 'metalness' };

/** Validate before resolving against a store or generating sibling URLs. */
export function validateTextureSource(source: string): string {
  const value = source.trim();
  if (value.startsWith('local:')) {
    if (!Object.hasOwn(localTextureCatalog, value.slice(6))) throw Error(`Unknown local texture "${value.slice(6)}".`);
    return value;
  }
  if (!value || value.startsWith('/') || value.includes('\\')) throw Error('Invalid texture source.');
  const absolute = /^[a-z][a-z\d+.-]*:/i.test(value);
  const url = new URL(value, 'https://textures.invalid/');
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw Error('Textures require credential-free HTTP(S) URLs.');
  const path = decodeURIComponent(value.split(/[?#]/, 1)[0]);
  if (path.split('/').includes('..') || path.includes('\\')) throw Error('Texture paths must remain inside the store.');
  if (!/\.(png|jpe?g|webp)$/i.test(url.pathname)) throw Error('Texture source must end in .png, .jpg, .jpeg, or .webp.');
  return absolute ? url.href : value;
}
export function resolveTextureVariants(source: string, base: string): Record<TextureSlot, string> {
  const value = validateTextureSource(source);
  if (value.startsWith('local:')) throw Error('Local textures must resolve through the bundled library.');
  const root = new URL(base.endsWith('/') ? base : base + '/');
  const url = new URL(value, root);
  if (!/^[a-z][a-z\d+.-]*:/i.test(value) && (url.origin !== root.origin || !url.pathname.startsWith(root.pathname))) throw Error('Texture paths must remain inside the store.');
  return Object.fromEntries(textureSlots.map(slot => {
    const sibling = new URL(url);
    sibling.pathname = sibling.pathname.replace(/(?:\.(?:map|normal|roughness|metalness))?(\.(?:png|jpe?g|webp))$/i, `.${suffixes[slot]}$1`);
    return [slot, sibling.href];
  })) as Record<TextureSlot, string>;
}
