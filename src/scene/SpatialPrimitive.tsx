import { updateTextureMaterial } from './textureMaterial';
import { useTextureMaps } from './TextureRuntime';
import { partitionGridGeometry } from './partitionGridGeometry';
import { useEffect, useMemo } from 'react';
import { threeClipPlanes } from '../model/clipping';
import { useObservableMesh } from './observability';
import { RoundedBoxGeometry } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import type { MeshStandardMaterialParameters } from 'three';
import type { SpatialGeometry } from '../model/geometry';
import { bufferGeometryForSpatialGeometry, normalizedXyzDslStrength, normalizedRoundedBoxRadius } from './primitiveGeometry';
import type { SpatialNode } from '../model/SpatialNode';
import { defaultBoxMaterial } from './materials';
import { shouldSelectFromClick } from './selectionClick';

interface SpatialPrimitiveProps {
  node: SpatialNode;
  tourMode?: boolean;
  onSelect?: (id: string) => void;
  selectionEnabled?: boolean;
}

function PartitionGeometry({ grid }: { grid: NonNullable<SpatialGeometry['partitionGrid']> }) {
  const geometry = useMemo(() => partitionGridGeometry(grid), [grid]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <primitive object={geometry} attach="geometry" dispose={null} />;
}

function DeformedGeometry({ geometry: spec }: { geometry: SpatialGeometry }) {
  const geometry = useMemo(() => bufferGeometryForSpatialGeometry(spec), [spec]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <primitive object={geometry} attach="geometry" dispose={null} />;
}

function PrimitiveGeometry({ geometry }: { geometry: SpatialGeometry }) {
  if (geometry.deformationFrames?.length || geometry.deformation?.operations.length) return <DeformedGeometry geometry={geometry} />;
  if (geometry.partitionGrid) return <PartitionGeometry grid={geometry.partitionGrid} />;
  switch (geometry.kind) {
    case 'cylinder':
      return <cylinderGeometry args={[0.5, 0.5, 1, 48]} />;
    case 'cone':
      return <coneGeometry args={[0.5, 1, 48]} />;
    case 'sphere':
      return <sphereGeometry args={[0.5, 48, 24]} />;
    case 'box': {
      const radius = normalizedRoundedBoxRadius(geometry);

      if (radius > 0) {
        const puff = normalizedXyzDslStrength(geometry.puff) ?? 0;

        return <RoundedBoxGeometry args={[1, 1, 1]} radius={radius} smoothness={8 + Math.round(puff * 8)} bevelSegments={4} />;
      }

      return <boxGeometry args={[1, 1, 1]} />;
    }
    default:
      return <boxGeometry args={[1, 1, 1]} />;
  }
}

export function materialParameters(node: SpatialNode): MeshStandardMaterialParameters {
  return {
    ...defaultBoxMaterial,
    color: node.material.color ?? (node.material.texture ? 'white' : defaultBoxMaterial.color),
    metalness: node.material.metalness ?? defaultBoxMaterial.metalness,
    roughness: node.material.roughness ?? defaultBoxMaterial.roughness,
  };
}

export function SpatialPrimitive({ node, onSelect, selectionEnabled = true, tourMode = false }: SpatialPrimitiveProps) {
  const { position, rotation, scale } = node.transform;
  const observableMesh = useObservableMesh(node, tourMode);
  const material = useTexturedMaterial(node);
  const clippingPlanes = useMemo(() => threeClipPlanes(node.clippingPlanes), [node.clippingPlanes]);

  function handleClick(event: ThreeEvent<MouseEvent>) {
    event.stopPropagation();
    if (shouldSelectFromClick(selectionEnabled, event)) onSelect?.(node.id);
  }

  return (
    <mesh
      ref={observableMesh}
      castShadow
      receiveShadow
      position={position}
      rotation={rotation}
      scale={scale}
      onClick={handleClick}
      userData={{
        spatialNodeId: node.id,
        xyzClippingPlanes: node.clippingPlanes,
        unionGroupId: node.unionGroupId,
        geometry: node.geometry.kind,
        rotation,
      }}
    >
      <PrimitiveGeometry geometry={node.geometry} />
      <meshStandardMaterial {...material} onUpdate={updateTextureMaterial} clippingPlanes={clippingPlanes} clipShadows />
    </mesh>
  );
}

export function useTexturedMaterial(node: SpatialNode): MeshStandardMaterialParameters {
  const maps = useTextureMaps(node.material.texture);
  return { ...materialParameters(node), ...maps,
    roughness: node.material.roughness ?? (maps.roughnessMap ? 1 : defaultBoxMaterial.roughness),
    metalness: node.material.metalness ?? (maps.metalnessMap ? 1 : defaultBoxMaterial.metalness),
  };
}
