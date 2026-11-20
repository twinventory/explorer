# Local texture library

The source PNGs in this directory are bundled by Vite into Explorer and the desktop
viewer. They load directly from the app, without the configured remote store or
desktop remote-asset proxy. No runtime download from R2 is required.

```text
"Oak/" : "texture: local:oak"
"Oak/+0+2/+0+1d/+0+1" : ""
```

Available: **oak** — light honey oak, generated base color, +Y normal, roughness
and metalness maps, 1254 × 1254 pixels. See `oak/generation.md` for prompts and
provenance. These are approximate PBR maps; seamless tiling is not verified.

To add a texture:

1. Add its name and description to `catalog.json`.
2. Create `<name>/` with `<name>.map.png`, `<name>.normal.png`,
   `<name>.roughness.png`, and `<name>.metalness.png`.
3. Include provenance/license information alongside the files.
4. Run `npx vitest run src/textures` and build the app.

Use lowercase names. All four files are required for catalog entries. The library
test checks catalog completeness. Texture properties still inherit normally, and
remote paths such as `texture: materials/wood.png` retain their existing behavior.
