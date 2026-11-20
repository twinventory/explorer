import { describe, expect, it } from 'vitest';
import { BoxGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { parseObjectProperties } from '../xyzdsl/objectDeclarationParser';
import { compileDeformation, localDeformationFrame, type Triple } from '../model/deformation';
import { createSpatialDocument } from '../model/createSpatialDocument';
import { matrixFromTransform } from '../model/transform';
import { bufferGeometryForSpatialGeometry } from './primitiveGeometry';
import { deformModelInstance } from './modelDeformation';
import { brushFor, evaluateCsgExpressionWithContributions } from './csgGeometry';
import { sweptSphereIntersectsScene } from './povCollision';

function spec(text: string) {
  const parsed = parseObjectProperties(text);
  expect(parsed.diagnostics).toEqual([]);
  return parsed.geometry.deformation!;
}
function mapping(text: string, dims: Triple = [10, 1, 1]) {
  const map = compileDeformation([localDeformationFrame(dims, spec(text))]);
  return (point: Triple) => map(new Vector3(...point.map((v, i) => v / dims[i]) as Triple)).multiply(new Vector3(...dims));
}
function doc(properties: string) { return createSpatialDocument(`"Bar/+0+141c/+0+12c/+0+12c":"${properties}"`); }
function near(actual: Vector3, expected: Triple, digits = 5) { expected.forEach((v, i) => expect(actual.getComponent(i)).toBeCloseTo(v, digits)); }
function volume(geometry: BoxGeometry | ReturnType<typeof bufferGeometryForSpatialGeometry>) {
  let result = 0;
  const p = geometry.attributes.position;
  const at = (i: number) => new Vector3().fromBufferAttribute(p, geometry.index ? geometry.index.getX(i) : i);
  for (let i = 0; i < (geometry.index?.count ?? p.count); i += 3) result += at(i).dot(at(i + 1).cross(at(i + 2))) / 6;
  return Math.abs(result);
}

describe('deformation language', () => {
  it('parses aliases, units, ranges and ordered expressions', () => {
    expect(spec('bend: x,z,180,80%..100%').operations[0]).toMatchObject({ kind: 'bend', amount: 180, range: [.8, 1] });
    expect(spec('deform: twist(x,180) bend(x,z,360)').operations.map(o => o.kind)).toEqual(['twist', 'bend']);
    expect(spec('jog: z,y,12c').operations[0]).toMatchObject({ kind: 'offset', amount: .12 });
    expect(spec('pinch: x,.5').operations[0].kind).toBe('bulge');
    expect(spec('compress: x,.5').operations[0].kind).toBe('stretch');
    expect(spec('flare: x,2').operations[0].kind).toBe('taper');
    expect(spec('wave: x,z,2c,3,20%..80%').operations[0].cycles).toBe(3);
    expect(spec('bend: x,z,45; bend: x,z,90').operations[0].amount).toBe(90);
    expect(spec('deform: none').operations).toEqual([]);
  });
  it.each(['bend: x,x,90', 'twist: q,20', 'bend: x,z,NaN', 'bend: x,z,Infinity', 'stretch: x,0', 'bulge: x,-1', 'bend: x,z,90,90%..10%', 'bend: x,z,90,0%..101%', 'bend: x,z,90; twist: x,90', 'deform: junk bend(x,z,90)', 'deform: bend(x,z,90) trailing', 'wave: x,z,1c,1.5', 'deform-volume: preserve', 'bend: x,z,90; deform-profile: bogus'])('diagnoses invalid input: %s', text => {
    const parsed = parseObjectProperties(text);
    expect(parsed.diagnostics.length).toBeGreaterThan(0);
    expect(parsed.geometry.deformation?.operations).toEqual([]);
  });
});

describe('material-coordinate operations', () => {
  it('anchors the beginning of a bend and carries its straight tail', () => {
    const map = mapping('bend: x,z,90,40%..60%');
    near(map([-3, 0, 0]), [-3, 0, 0]);
    near(map([-1, 0, 0]), [-1, 0, 0]);
    const r = 2 / (Math.PI / 2);
    near(map([3, 0, 0]), [-1 + r, 0, r + 2]);
  });
  it('makes the exact 28.2 cm terminal hook with its first 80% fixed', () => {
    const map = mapping('bend: x,z,180,80%..100%', [1.41, .12, .12]);
    near(map([.4, .06, .06]), [.4, .06, .06]);
    near(map([.705, 0, 0]), [.423, 0, 2 * .282 / Math.PI]);
  });
  it('preserves requested total bend and twist angles under smooth profiles', () => {
    const map = mapping('bend: x,z,90,20%..80%; deform-profile: smooth');
    const end = map([3, 0, 0]), tail = map([4, 0, 0]);
    near(tail.sub(end), [0, 0, 1]);
    near(mapping('twist: x,90; deform-profile: smooth')([5, .5, 0]), [5, 0, .5]);
  });
  it('keeps interval membership attached to original material through composition', () => {
    const map = mapping('deform: stretch(x,2) twist(x,180,80%..100%)');
    near(map([3, .5, 0]), [11, .5, 0]);
    near(map([5, .5, 0]), [15, -.5, 0]);
    const first = mapping('deform: twist(x,90) bend(x,z,90)')([0, .5, 0]);
    const second = mapping('deform: bend(x,z,90) twist(x,90)')([0, .5, 0]);
    expect(first.distanceTo(second)).toBeGreaterThan(.1);
  });
  it('implements taper, bulge, shear, jog and wave with their distinct continuations', () => {
    near(mapping('taper: x,2')([5, .5, .5]), [5, 1, 1]);
    near(mapping('pinch: x,.5')([0, .5, .5]), [0, .25, .25]);
    near(mapping('bulge: x,2')([5, .5, .5]), [5, .5, .5]);
    near(mapping('shear: x,z,2')([0, 0, 0]), [0, 0, 1]);
    near(mapping('offset: x,z,2,20%..80%')([5, 0, 0]), [5, 0, 2]);
    near(mapping('wave: x,z,1,1')([-2.5, 0, 0]), [-2.5, 0, 1]);
    near(mapping('wave: x,z,1,1')([5, 0, 0]), [5, 0, 0]);
  });
  it('preserves volume for uniform stretch and inverse compression', () => {
    near(mapping('stretch: x,2; deform-volume: preserve')([0, .5, .5]), [5, .5 / Math.sqrt(2), .5 / Math.sqrt(2)]);
    near(mapping('compress: x,.5; deform-volume: preserve')([0, .5, .5]), [-2.5, .5 * Math.sqrt(2), .5 * Math.sqrt(2)]);
  });
  it('keeps targeted volume-preserving stretch continuous at both boundaries', () => {
    const map = mapping('stretch: x,2,40%..60%; deform-volume: preserve');
    near(map([-1, .5, .5]), [-1, .5, .5]);
    near(map([1, .5, .5]), [3, .5, .5]);
    expect(map([0, .5, .5]).y).toBeLessThan(.5);
    near(map([2, .5, .5]), [4, .5, .5]);
    expect(map([-1 + 1e-6, .5, .5]).distanceTo(map([-1 - 1e-6, .5, .5]))).toBeLessThan(1e-4);
  });
  it('keeps severe smooth compression finite and strictly increasing', () => {
    const map = mapping('compress: x,.01; deform-profile: smooth; deform-volume: preserve');
    let previous = -Infinity;
    for (let i = 0; i <= 100; i++) {
      const p = map([-5 + i / 10, .5, .5]);
      expect(p.toArray().every(Number.isFinite)).toBe(true);
      expect(p.x).toBeGreaterThan(previous);
      previous = p.x;
    }
    near(map([5, 0, 0]), [-4.9, 0, 0]);
  });
  it.each(['stretch: x,2', 'taper: x,2', 'bulge: x,2', 'pinch: x,.5'])('preserves mesh volume within tessellation accuracy: %s', operation => {
    const geometry = bufferGeometryForSpatialGeometry({ kind: 'box', dimensions: [10, 1, 1], deformation: spec(`${operation}; deform-volume: preserve`) });
    expect(volume(geometry)).toBeCloseTo(1, 2); // mesh remains normalized; placement restores physical dimensions
    geometry.dispose();
  });
});

describe('scene deformation integration', () => {
  it('closes a rectangular ring, updates bounds and leaves its hole pickable and traversable', () => {
    const sceneDoc = doc('bend: x,z,360');
    expect(sceneDoc.diagnostics).toEqual([]);
    const node = sceneDoc.renderNodes[0];
    const r = 1.41 / (2 * Math.PI);
    expect(node.bounds.maxX - node.bounds.minX).toBeCloseTo(2 * (r + .06), 3);
    const geometry = bufferGeometryForSpatialGeometry(node.geometry);
    const mesh = new Mesh(geometry, new MeshBasicMaterial({ side: DoubleSide }));
    mesh.applyMatrix4(matrixFromTransform(node.transform)); mesh.userData.spatialNodeId = node.id;
    const scene = new Group(); scene.add(mesh); scene.updateMatrixWorld(true);
    const center = new Vector3(0, .06, r + .06);
    expect(new Raycaster(center.clone().add(new Vector3(0, 1, 0)), new Vector3(0, -1, 0)).intersectObject(mesh)).toHaveLength(0);
    expect(sweptSphereIntersectsScene(scene, center.clone().add(new Vector3(0, 1, 0)), center.clone().add(new Vector3(0, -1, 0)), .01)).toBe(false);
    expect(new Raycaster(new Vector3(r, 1, r + .06), new Vector3(0, -1, 0)).intersectObject(mesh).length).toBeGreaterThan(0);
    expect(volume(geometry)).toBeCloseTo(1, 2);
    const position = geometry.attributes.position;
    for (let i = 0; i < position.count; i++) expect(Number.isFinite(position.getX(i))).toBe(true);
    geometry.dispose();
  });
  it('deforms an assembled parent once, preserving child-relative frames', () => {
    const scene = createSpatialDocument('"Assembly/+0+2/+0+1/+0+1":"bend: x,z,90"\n"Assembly/A/+0+1/+0+1/+0+1":""\n"Assembly/B/+1+1/+0+1/+0+1":""');
    expect(scene.diagnostics).toEqual([]);
    expect(scene.renderNodes).toHaveLength(2);
    for (const node of scene.renderNodes) {
      expect(node.geometry.deformation).toBeUndefined();
      expect(node.geometry.deformationFrames).toHaveLength(1);
    }
    const [a, b] = scene.renderNodes;
    const ma = compileDeformation(a.geometry.deformationFrames!);
    const mb = compileDeformation(b.geometry.deformationFrames!);
    const boundaryA = ma(new Vector3(.5, 0, 0)).applyMatrix4(matrixFromTransform(a.transform));
    const boundaryB = mb(new Vector3(-.5, 0, 0)).applyMatrix4(matrixFromTransform(b.transform));
    expect(boundaryA.distanceTo(boundaryB)).toBeLessThan(1e-8);
  });
  it('supports reference overrides and an explicit none reset', () => {
    const scene = createSpatialDocument('"Template/+0+2/+0+1/+0+1":"twist: x,90"\n"Copy/+3+2/+0+1/+0+1":"ref: Template; deform: none"');
    expect(scene.diagnostics).toEqual([]);
    const copy = scene.renderNodes.find(n => n.namespacePath?.includes('Copy'))!;
    expect(copy.geometry.deformation?.operations).toEqual([]);
    expect(copy.geometry.deformationFrames).toBeUndefined();
  });
  it('keeps nested and scaled-reference deformation frames continuous', () => {
    const scene = createSpatialDocument('"Template/+0+2/+0+1/+0+1":"bend: x,z,90"\n"Template/A/+0+1/+0+1/+0+1":"twist: x,90"\n"Template/B/+1+1/+0+1/+0+1":""\n"Copy/+4+4/+0+2/+0+2":"ref: Template; ref-scale: true"');
    expect(scene.diagnostics).toEqual([]);
    const child = scene.renderNodes.find(n => n.namespacePath?.includes('Copy/A'))!;
    expect(child.geometry.deformationFrames).toHaveLength(2);
    expect(child.geometry.deformationFrames![1].dimensions).toEqual([2, 1, 1]);
    const point = compileDeformation(child.geometry.deformationFrames!)(new Vector3(-.5, 0, 0)).applyMatrix4(matrixFromTransform(child.transform));
    near(point, [4, 1, 1]);
  });
  it('uses deformed primitives as CSG operands', () => {
    const scene = createSpatialDocument('"Ring/+0+141c/+0+12c/+0+12c":"bend: x,z,360"\n"Cut/+0+1/+0+1/+0+1":"operation: subtraction"');
    expect(scene.diagnostics).toEqual([]);
    expect(scene.csgExpressions).toHaveLength(1);
    const result = evaluateCsgExpressionWithContributions(scene.csgExpressions[0]);
    expect(result.geometry.attributes.position.count).toBeGreaterThan(0);
    result.geometry.dispose();
  });
  it('removes coincident caps for compatible twist-then-ring chains', () => {
    const node = doc('deform: twist(x,180) bend(x,z,360)').renderNodes[0];
    const brush = brushFor(node);
    expect(volume(brush.geometry)).toBeCloseTo(1.41 * .12 * .12, 3);
    brush.geometry.dispose();
  });
  it('preserves outward normals under volume-preserving stretch', () => {
    const geometry = bufferGeometryForSpatialGeometry({ kind: 'box', dimensions: [10, 1, 1], deformation: spec('stretch: x,2; deform-volume: preserve') });
    const normal = geometry.attributes.normal;
    for (let i = 0; i < normal.count; i++) {
      const n = new Vector3().fromBufferAttribute(normal, i);
      expect(n.length()).toBeCloseTo(1, 5);
      expect(Math.max(Math.abs(n.x), Math.abs(n.y), Math.abs(n.z))).toBeCloseTo(1, 5);
    }
    geometry.dispose();
  });
  it.each(['shear(x,z,-60c) bend(x,z,1080)', 'shear(x,z,60c) bend(x,z,-1080)'])('accepts the spaced spiral without a false overlap warning: %s', chain => {
    const scene = createSpatialDocument(`"Spiral/+805m+141c/+0+12c/+1196m+12c":"deform: ${chain}"`);
    expect(scene.diagnostics).toEqual([]);
    expect(scene.renderNodes).toHaveLength(1);
    const geometry = bufferGeometryForSpatialGeometry(scene.renderNodes[0].geometry);
    expect(geometry.attributes.position.count).toBeGreaterThan(100);
    expect(geometry.boundingBox!.isEmpty()).toBe(false);
    geometry.dispose();
  });
  it.each([
    'bend: x,z,1080',
    'deform: shear(x,z,-30c) bend(x,z,1080)',
    'deform: shear(x,z,-36c) bend(x,z,1080)',
    'deform: shear(x,z,60c) bend(x,z,1080)',
    'deform: shear(x,y,-60c) bend(x,z,1080)',
    'deform: shear(x,z,-60c,20%..100%) bend(x,z,1080)',
    'deform: shear(x,z,-60c) bend(x,z,1080); deform-profile: smooth',
    'deform: shear(x,z,-60c) bend(x,z,1080) twist(x,90)',
  ])('retains warnings when a spaced spiral cannot be established: %s', properties => {
    expect(doc(properties).diagnostics.some(d => d.message.includes('overlap itself'))).toBe(true);
  });
  it('retains fold warnings even with ample spacing between turns', () => {
    const scene = createSpatialDocument('"Spiral/+0+141c/+0+12c/+0+20c":"deform: shear(x,z,-90c) bend(x,z,1080)"');
    expect(scene.diagnostics.some(d => d.message.includes('inner surface'))).toBe(true);
    expect(scene.diagnostics.some(d => d.message.includes('overlap itself'))).toBe(true);
  });
  it('reports unsupported cards and inner-radius folds', () => {
    expect(doc('bend: x,z,360,80%..100%').diagnostics.some(d => d.message.includes('inner surface'))).toBe(true);
    const cards = doc('bend: x,z,90; content-kind: text; content-text: hello');
    expect(cards.diagnostics.some(d => d.message.includes('cards'))).toBe(true);
    expect(cards.renderNodes).toHaveLength(0);
  });
  it('deforms fitted static model copies without altering shared geometry', () => {
    const node = doc('bend: x,z,90; model: bar.glb').renderNodes[0];
    const asset = new Group(), original = new BoxGeometry();
    asset.add(new Mesh(original));
    const saved = original.attributes.position.array.slice();
    const instance = deformModelInstance(asset, node, { position: [0, 0, 0], scale: [1, 1, 1] });
    const result = (instance.scene.children[0] as Mesh).geometry;
    expect(result.attributes.position.count).toBeGreaterThan(original.attributes.position.count);
    expect(original.attributes.position.array).toEqual(saved);
    expect(result.boundingBox!.max.z).toBeGreaterThan(.5);
    instance.dispose(); original.dispose();
  });
});
