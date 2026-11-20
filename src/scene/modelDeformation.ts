import { Matrix4, type BufferGeometry, type Mesh, type Object3D } from 'three';
import type { SpatialNode } from '../model/SpatialNode';
import type { ModelFitTransform } from './modelFit';
import { deformBufferGeometry } from './deformationGeometry';

/** Deform instance-owned buffers after fitting, leaving cached GLBs untouched.
 * The output remains in asset space so existing rendering/CSG transforms apply. */
export function deformModelInstance(scene: Object3D, node: SpatialNode, fitted: ModelFitTransform) {
  const result = scene.clone(true);
  const owned = new Set<BufferGeometry>();
  const fit = new Matrix4().makeScale(...fitted.scale).multiply(new Matrix4().makeTranslation(...fitted.position));
  result.updateMatrixWorld(true);
  try {
    result.traverse(object => {
      if (!('isMesh' in object)) return;
      const mesh = object as Mesh;
      if ('isSkinnedMesh' in mesh || 'isInstancedMesh' in mesh || Object.keys(mesh.geometry.morphAttributes).length) {
        throw Error('Deformation requires static model meshes without skinning, instancing or morph targets.');
      }
      const toNode = fit.clone().multiply(mesh.matrixWorld);
      const frames = (node.geometry.deformationFrames ?? []).map(frame => {
        const to = new Matrix4().fromArray(frame.toFrame).multiply(toNode);
        return { ...frame, toFrame: to.toArray(), fromFrame: to.clone().invert().toArray() };
      });
      mesh.geometry = deformBufferGeometry(mesh.geometry, frames);
      owned.add(mesh.geometry);
    });
    return { scene: result, dispose: () => owned.forEach(geometry => geometry.dispose()) };
  } catch (error) { owned.forEach(geometry => geometry.dispose()); throw error; }
}
