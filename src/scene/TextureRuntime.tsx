import { localTextureMaps } from '../textures/library';
import { createContext, useContext, useEffect, useState } from 'react';
import { TextureLoader, SRGBColorSpace, NoColorSpace, type Texture } from 'three';
import { DEFAULT_MODEL_ASSET_BASE } from './remoteModelUrl';
import { resolveTextureVariants, textureSlots, type TextureSlot } from '../model/textureVariants';

const direct = async (url: string) => url;
export const TextureTransport = createContext(direct);
type Maps = Partial<Record<TextureSlot, Texture>>;
type Entry = { refs: number; promise: Promise<Texture> };
const caches = new WeakMap<typeof direct, Map<string, Entry>>();
/** Reference-counted textures; obsolete in-flight requests dispose after settling. */
export function acquireTexture(url: string, color: boolean, transport = direct) {
  let cache = caches.get(transport);
  if (!cache) { cache = new Map(); caches.set(transport, cache); }
  const key = `${color}:${url}`;
  let entry = cache.get(key);
  if (!entry) {
    const promise = transport(url).then(source => new TextureLoader().loadAsync(source)).then(texture => {
      texture.colorSpace = color ? SRGBColorSpace : NoColorSpace;
      return texture;
    });
    entry = { refs: 0, promise }; cache.set(key, entry);
  }
  entry.refs++;
  const owned = entry;
  let released = false;
  return { promise: owned.promise, release() {
    if (released) return;
    released = true;
    if (--owned.refs === 0) {
      cache!.delete(key);
      void owned.promise.then(texture => texture.dispose(), () => {});
    }
  } };
}
export function useTextureMaps(source?: string): Maps {
  const transport = useContext(TextureTransport);
  const [state, setState] = useState<{ source?: string; transport: typeof direct; maps: Maps }>({ transport, maps: {} });
  useEffect(() => {
    let active = true;
    setState({ source, transport, maps: {} });
    if (!source) return;
    const local = localTextureMaps(source);
    const urls = local ?? resolveTextureVariants(source, DEFAULT_MODEL_ASSET_BASE);
    const claims = textureSlots.map(slot => {
      const claim = acquireTexture(urls[slot], slot === 'map', local ? direct : transport);
      void claim.promise.then(texture => {
        if (active) setState(previous => ({ source, transport, maps: { ...previous.maps, [slot]: texture } }));
      }, error => { if (active) console.warn(`Texture ${slot} unavailable: ${urls[slot]}`, error); });
      return claim;
    });
    return () => { active = false; claims.forEach(claim => claim.release()); };
  }, [source, transport]);
  return state.source === source && state.transport === transport ? state.maps : {};
}
