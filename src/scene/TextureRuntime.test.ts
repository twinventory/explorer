import { expect, it, vi } from 'vitest';
import { Texture, TextureLoader, SRGBColorSpace, NoColorSpace } from 'three';
import { acquireTexture } from './TextureRuntime';

it('shares concurrent loads and disposes only after the last release', async () => {
  const texture = new Texture<HTMLImageElement>(); const dispose = vi.spyOn(texture, 'dispose');
  const load = vi.spyOn(TextureLoader.prototype, 'loadAsync').mockResolvedValue(texture);
  const transport = vi.fn(async (url: string) => url);
  const a = acquireTexture('https://host/a.png', true, transport);
  const b = acquireTexture('https://host/a.png', true, transport);
  expect(await a.promise).toBe(await b.promise); expect(transport).toHaveBeenCalledTimes(1);
  expect(texture.colorSpace).toBe(SRGBColorSpace);
  a.release(); expect(dispose).not.toHaveBeenCalled(); b.release(); await Promise.resolve();
  expect(dispose).toHaveBeenCalledTimes(1); load.mockRestore();
});
it('disposes obsolete in-flight data maps when they finish', async () => {
  let finish!: (t: Texture<HTMLImageElement>) => void;
  const load = vi.spyOn(TextureLoader.prototype, 'loadAsync').mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const texture = new Texture<HTMLImageElement>(); const dispose = vi.spyOn(texture, 'dispose');
  const a = acquireTexture('https://host/normal.png', false, async u => u);
  await Promise.resolve(); a.release(); finish(texture); await a.promise; await Promise.resolve();
  expect(texture.colorSpace).toBe(NoColorSpace); expect(dispose).toHaveBeenCalledTimes(1); load.mockRestore();
});
