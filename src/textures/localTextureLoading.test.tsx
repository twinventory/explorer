// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { Texture, TextureLoader } from 'three';
import { TextureTransport, useTextureMaps } from '../scene/TextureRuntime';

it('loads bundled maps without invoking the remote transport and releases them on unmount', async () => {
  const textures: Texture<HTMLImageElement>[] = [];
  const load = vi.spyOn(TextureLoader.prototype, 'loadAsync').mockImplementation(async () => {
    const texture = new Texture<HTMLImageElement>();
    vi.spyOn(texture, 'dispose'); textures.push(texture); return texture;
  });
  const remote = vi.fn(async (url: string) => url);
  try {
    const hook = renderHook(() => useTextureMaps('local:oak'), {
      wrapper: ({ children }) => <TextureTransport.Provider value={remote}>{children}</TextureTransport.Provider>,
    });
    await waitFor(() => expect(Object.keys(hook.result.current)).toHaveLength(4));
    expect(remote).not.toHaveBeenCalled();
    expect(load).toHaveBeenCalledTimes(4);
    hook.unmount();
    await waitFor(() => textures.forEach(texture => expect(texture.dispose).toHaveBeenCalledTimes(1)));
  } finally { load.mockRestore(); }
});
