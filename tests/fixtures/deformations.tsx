import React, { useLayoutEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Canvas, useThree } from '@react-three/fiber';
import { OrthographicCamera, Vector3 } from 'three';
import { createSpatialDocument } from '../../src/model/createSpatialDocument';
import { SpatialPrimitive } from '../../src/scene/SpatialPrimitive';
import type { SpatialNode } from '../../src/model/SpatialNode';
const examples = [
  ['Original', ''], ['Bend', 'bend: x,z,90'], ['Ring', 'bend: x,z,360'],
  ['Terminal hook', 'bend: x,z,180,80%..100%'], ['Twist', 'twist: x,180'], ['Taper / flare', 'taper: x,2'],
  ['Bulge', 'bulge: x,2'], ['Pinch', 'pinch: x,.4'], ['Shear', 'shear: x,z,35c'],
  ['Section stretch + volume', 'stretch: x,2,30%..70%; deform-volume: preserve'], ['Offset / jog', 'jog: x,z,35c,20%..80%'], ['Wave', 'wave: x,z,10c,2; deform-profile: smooth'],
];
let rendered = 0;
const scenes = examples.map(([title, properties]) => ({ title, properties, document: createSpatialDocument(`"Bar/+0+141c/+0+12c/+0+12c":"${properties ? properties + ';' : ''}color: #219fa6; roughness: .6"`) }));
(window as any).deformationQA = { diagnostics: scenes.flatMap(s => s.document.diagnostics), rendered: 0 };
function Frame({ node }: { node: SpatialNode }) {
  const { camera, size, gl, scene } = useThree();
  useLayoutEffect(() => {
    const b = node.bounds;
    const center = new Vector3((b.minX+b.maxX)/2, (b.minY+b.maxY)/2, (b.minZ+b.maxZ)/2);
    camera.position.copy(center).add(new Vector3(.35, 1.4, 2)); camera.lookAt(center);
    const width = b.maxX-b.minX, depth = b.maxZ-b.minZ, height = b.maxY-b.minY;
    (camera as OrthographicCamera).zoom = Math.min(size.width/(width+depth*.25+.2), size.height/(height+depth*.6+.25)) * .82;
    camera.updateProjectionMatrix(); gl.render(scene, camera);
    (window as any).deformationQA.rendered = ++rendered;
  }, [camera, size.width, size.height, node]);
  return null;
}
createRoot(document.getElementById('root')!).render(<div className="grid">{scenes.map(({title,properties,document}) => <article key={title}><h2>{title}</h2><div className="viewport"><Canvas orthographic frameloop="demand" gl={{preserveDrawingBuffer:true}}><ambientLight intensity={1.3}/><directionalLight position={[2,5,3]} intensity={2.5}/><SpatialPrimitive node={document.renderNodes[0]}/><Frame node={document.renderNodes[0]}/></Canvas></div><code>{properties || 'No deformation'}</code></article>)}</div>);
