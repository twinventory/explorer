import type { MeshStandardMaterial } from 'three';

const configurations = new WeakMap<MeshStandardMaterial, string>();
/** Adding/removing an asynchronously loaded map changes shader defines. */
export function updateTextureMaterial(material: MeshStandardMaterial) {
  const configuration = [material.map, material.normalMap, material.roughnessMap, material.metalnessMap]
    .map(texture => texture ? String(texture.channel) : '-').join(',');
  if (configurations.get(material) !== configuration) {
    configurations.set(material, configuration);
    material.needsUpdate = true;
  }
}
