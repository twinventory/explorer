import { compilePhysics } from '../physics/compilePhysics';
import { Matrix4 } from 'three';
import { deformationDiagnostics, type Triple } from './deformation';
import type { DeformationSpec } from '../xyzdsl/deformation';
import { bufferGeometryForSpatialGeometry } from '../scene/primitiveGeometry';
import { clippedBounds, repeatClipPlanes } from './clipping';
import { parseXyzDslDocument } from '../xyzdsl/parser';
import { resolveXyzDslDocument } from '../xyzdsl/resolveDocument';
import { canonicalNamespacePath } from '../xyzdsl/pathParser';
import type { SpatialDocument } from './SpatialDocument';
import type { SpatialNode } from './SpatialNode';
import { assignUnionGroups, boundsFromTransformedBox } from './collision';
import { buildCsgExpressions } from './csg';
import { geometryFromBox } from './geometry';
import {
  matrixFromTransform,
  anchorTransformFromBox,
  composeTransforms,
  transformFromBox,
} from './transform';

function nearestConcreteAncestor(
  namespace: string[],
  nodesByNamespace: Map<string, SpatialNode>,
): SpatialNode | undefined {
  for (let length = namespace.length - 1; length > 0; length -= 1) {
    const ancestor = nodesByNamespace.get(
      canonicalNamespacePath(namespace.slice(0, length)),
    );

    if (ancestor) {
      return ancestor;
    }
  }

  return undefined;
}

function flattenRenderable(nodes: SpatialNode[]): SpatialNode[] {
  return nodes
    .flatMap((node) => [
      node.renderable ? node : undefined,
      ...flattenRenderable(node.children ?? []),
    ])
    .filter(Boolean) as SpatialNode[];
}

function applyRenderableStateToTree(
  nodes: SpatialNode[],
  renderableNodes: SpatialNode[],
): SpatialNode[] {
  const stateById = new Map(renderableNodes.map((node) => [node.id, node]));

  return nodes.map((node) => {
    const state = stateById.get(node.id);

    return {
      ...node,
      unionGroupId: state?.unionGroupId ?? node.unionGroupId,
      csgExpressionId: state?.csgExpressionId ?? node.csgExpressionId,
      csgConsumed: state?.csgConsumed ?? node.csgConsumed,
      modelCsgOperations: state?.modelCsgOperations,
      children: node.children ? applyRenderableStateToTree(node.children, renderableNodes) : undefined,
    };
  });
}

export function createSpatialDocument(source: string): SpatialDocument {
  const parsed = parseXyzDslDocument(source);
  const resolved = resolveXyzDslDocument(parsed.value ?? []);
  const diagnostics = [...parsed.diagnostics, ...resolved.diagnostics];
  const nodesByNamespace = new Map<string, SpatialNode>();
  const topLevelNodes: SpatialNode[] = [];
  type Owner = { dimensions: Triple; spec: DeformationSpec; world: Matrix4 };
  const deformationOwners = new Map<string, Owner[]>();

  resolved.objects
    .sort(
      (a, b) =>
        a.namespace.length - b.namespace.length || a.lineNumber - b.lineNumber,
    )
    .forEach((object) => {
      const geometry = object.model.source && object.geometry.operation
        ? { ...object.geometry, operation: undefined }
        : object.geometry;
      if (object.model.source && object.geometry.operation) {
        diagnostics.push({
          line: object.lineNumber,
          source: object.source,
          message: 'CSG operations are not supported for imported models.',
        });
      }
      const parent = nearestConcreteAncestor(
        object.namespace,
        nodesByNamespace,
      );
      const hasChildren = resolved.objects.some(
        (candidate) =>
          candidate !== object &&
          candidate.namespace.length > object.namespace.length &&
          object.namespace.every(
            (segment, index) => candidate.namespace[index] === segment,
          ),
      );
      const localTransform = object.renderable || object.viewPoint
        ? transformFromBox(object.box, object.transform)
        : {
            ...anchorTransformFromBox(object.box, object.transform),
            scale: object.anchorScale ?? [1, 1, 1],
          };
      const worldTransform = parent?.worldTransform
        ? composeTransforms(parent.worldTransform, localTransform)
        : localTransform;
      const clippingPlanes = [
        ...(parent?.clippingPlanes ?? []),
        ...repeatClipPlanes(object.repeatClip ?? [], parent?.worldTransform ? matrixFromTransform(parent.worldTransform) : new Matrix4()),
      ];
      const spatialGeometry = { ...geometryFromBox(object.box, geometry), ...(object.partitionGrid ? { partitionGrid: object.partitionGrid } : {}) };
      const owners = [...(parent ? deformationOwners.get(parent.id) ?? [] : [])];
      if (geometry.deformation?.operations.length) {
        const dimensions = spatialGeometry.dimensions.map((n, i) => n / (!object.renderable ? object.anchorScale?.[i] ?? 1 : 1)) as Triple;
        const world = matrixFromTransform(worldTransform).multiply(object.renderable
          ? new Matrix4().makeScale(...dimensions.map(n => 1 / n) as Triple)
          : new Matrix4().makeTranslation(...dimensions.map(n => n / 2) as Triple));
        owners.unshift({ dimensions, spec: geometry.deformation, world });
        diagnostics.push(...deformationDiagnostics(geometry.deformation, dimensions).map(message => ({ line: object.lineNumber, source: object.source, message })));
      }
      deformationOwners.set(object.id, owners);
      if (owners.length) spatialGeometry.deformationFrames = owners.map(owner => {
        const to = owner.world.clone().invert().multiply(matrixFromTransform(worldTransform));
        return { dimensions: owner.dimensions, spec: owner.spec, toFrame: to.toArray(), fromFrame: to.clone().invert().toArray() };
      });
      let deformationFailed = false;
      let originalBounds = boundsFromTransformedBox(object.box, worldTransform);
      if (owners.length && object.renderable) {
        const unsupported = object.content.kind && !object.model.source ? 'Live text/URL cards cannot be mesh-deformed.'
          : object.light || object.viewPoint ? 'Lights and viewpoints cannot be mesh-deformed.'
          : clippingPlanes.length ? 'Deformation with repeat-edge: clip is not supported; use whole repetitions.'
          : owners.length > 16 ? 'Deformation supports at most sixteen nested owner frames.' : undefined;
        try {
          if (unsupported) throw Error(unsupported);
          // Imported assets load asynchronously. Their deformed target envelope
          // provides bounds until exact mesh geometry is available to raycasting.
          const buffer = bufferGeometryForSpatialGeometry(object.model.source ? { ...spatialGeometry, kind: 'box', 'box-radius': undefined, puff: undefined, partitionGrid: undefined } : spatialGeometry);
          try {
            buffer.applyMatrix4(matrixFromTransform(worldTransform)); buffer.computeBoundingBox();
            const b = buffer.boundingBox!;
            originalBounds = { minX: b.min.x, maxX: b.max.x, minY: b.min.y, maxY: b.max.y, minZ: b.min.z, maxZ: b.max.z };
          } finally { buffer.dispose(); }
        } catch (error) {
          deformationFailed = true;
          diagnostics.push({ line: object.lineNumber, source: object.source, message: (error as Error).message });
        }
      }
      const bounds = clippedBounds(originalBounds, clippingPlanes);
      const unsupportedContent = clippingPlanes.length > 0 && object.content.kind && !object.model.source;
      if (unsupportedContent) diagnostics.push({ line: object.lineNumber, source: object.source,
        message: 'repeat-edge: clip supports primitives and imported models; content cards inside clipped subtrees are omitted.',
      });
      const node: SpatialNode = {
        id: object.id,
        source: object.source,
        box: object.box,
        light: object.renderable && !deformationFailed ? object.light : undefined,
        material: object.material,
        content: object.content,
        model: object.model.source ? object.model : undefined,
        geometry: spatialGeometry,
        localTransform,
        worldTransform,
        transform: worldTransform,
        bounds: bounds ?? originalBounds,
        ...(clippingPlanes.length ? { clippingPlanes } : {}),
        namespacePath: object.namespacePath,
        parentNamespacePath: object.parentNamespacePath,
        renderable: object.renderable && !object.viewPoint && !object.light && Boolean(bounds) && !unsupportedContent && !deformationFailed,
        children: [],
        metadata: {
          viewPoint: Boolean(object.viewPoint && object.renderable && !deformationFailed),
          lineNumber: object.lineNumber,
          declarationOnly: object.declarationOnly,
          container: hasChildren,
          reference: object.reference.targetPath,
          materializedFrom: object.materializedFrom,
          anchorScale: object.anchorScale,
          attachedPanelId: object.attachedPanelId,
          attachmentEnclosureId: object.attachmentEnclosureId,
          attachmentFrame: object.attachmentFrame,
          repeatGroupId: object.repeatGroupId,
          surfaceSourceId: object.surfaceSourceId,
          surfaceFace: object.surfaceFace,
          partitionGrid: Boolean(object.partitionGrid),
          cellIndices: object.cellIndices,
          cellFrame: object.cellFrame,
          repeatSourceId: object.repeatSourceId,
          repeatIndices: object.repeatIndices,
        },
      };

      if (object.namespacePath && !nodesByNamespace.has(object.namespacePath)) {
        nodesByNamespace.set(object.namespacePath, node);
      }

      if (parent) {
        parent.children = [...(parent.children ?? []), node];
      } else {
        topLevelNodes.push(node);
      }
    });

  const allNodes = [...nodesByNamespace.values()];
  const byId = new Map(allNodes.map(node => [node.id, node]));
  for (const node of allNodes) {
    const panel = byId.get(node.metadata?.attachedPanelId as string);
    if (panel) node.surfaceVisibility = { transform: panel.transform, observable: panel.material.observable };
  }
  const candidates = flattenRenderable(topLevelNodes);
  const groupedNodes = assignUnionGroups(candidates.filter(node => node.renderable));
  const csg = buildCsgExpressions(groupedNodes);
  const renderNodes = csg.nodes.filter((node) => !node.csgConsumed && (!node.csgExpressionId || node.modelCsgOperations));
  const nodes = applyRenderableStateToTree(topLevelNodes, csg.nodes);

  return {
    physics: compilePhysics(parsed.value ?? [], resolved.objects, nodes, diagnostics),
    id: 'spatial-document',
    nodes,
    renderNodes,
    csgExpressions: csg.expressions,
    diagnostics,
  };
}
