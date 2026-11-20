import { describe, expect, it } from 'vitest';
import { createSpatialDocument } from '../model/createSpatialDocument';
import { parseXyzDslDocument } from '../xyzdsl/parser';
import { resolveXyzDslDocument } from '../xyzdsl/resolveDocument';
import { Simulation } from './simulation';
const component = '"Experiment/+0+4/+0+4/+0+4" : "gravity: 0,0,0"';
const block = (mass = 2) => `"Experiment/Block/+0+1/+0+1/+0+1" : "body: rigid; mass: ${mass}; color: red"`;
const force = (vector = '10,0,0', point = 'center', duration = '1') => `"Experiment/Block" : "action: force; vector: ${vector}; point: ${point}; duration: ${duration}"`;
function setup(source: string) {
  const document = createSpatialDocument(source);
  expect(document.diagnostics).toEqual([]);
  expect(document.physics?.bodies).toHaveLength(1);
  return { document, simulation: new Simulation(document.physics!) };
}
describe('body-addressed force contract', () => {
  it('keeps geometry and accumulates actions, including forward declarations', () => {
    const source = [force(), component, block(), force('0,0,5')].join('\n');
    const { simulation, document } = setup(source);
    expect(document.renderNodes).toHaveLength(1);
    expect(document.renderNodes[0].material.color).toBe('red');
    expect(simulation.bodies[0].definition.actions).toHaveLength(2);
    expect(resolveXyzDslDocument(parseXyzDslDocument(source).value!).objects).toHaveLength(2);
    simulation.step(1);
    expect(simulation.bodies[0].velocity.x).toBeCloseTo(5, 8);
    expect(simulation.bodies[0].velocity.z).toBeCloseTo(2.5, 8);
  });
  it('matches constant-force displacement, inverse-mass acceleration, and coasting', () => {
    for (const mass of [2, 4]) {
      const { simulation, document } = setup([component, block(mass), force()].join('\n'));
      simulation.step(1);
      const b = simulation.bodies[0];
      expect(b.position.x).toBeCloseTo(.5 + 5/mass, 8);
      expect(b.velocity.x).toBeCloseTo(10/mass, 8);
      expect(b.angularVelocity.length()).toBe(0);
      simulation.step(1);
      expect(b.position.x).toBeCloseTo(.5 + 15/mass, 8);
      expect(b.velocity.x).toBeCloseTo(10/mass, 8);
      expect(document.renderNodes[0].transform.position[0]).toBe(.5);
      expect(simulation.document(document).renderNodes[0].transform.position[0]).toBeCloseTo(b.position.x);
    }
  });
  it('falls with default gravity regardless of mass, without implicitly simulating geometry', () => {
    for (const mass of [1, 5]) {
      const { simulation } = setup(block(mass).replace('Experiment/Block', 'Block'));
      simulation.step(1);
      expect(simulation.bodies[0].velocity.y).toBeCloseTo(-9.81, 8);
      expect(simulation.bodies[0].position.y).toBeCloseTo(.5 - 9.81/2, 8);
    }
    expect(createSpatialDocument('"+0+1/+0+1/+0+1":""').physics?.bodies).toEqual([]);
  });
  it('produces off-center torque and conserves angular momentum after force expiry', () => {
    const { simulation } = setup([component, block(), force('10,0,0', '50c,1,50c', '.1')].join('\n'));
    simulation.step(.1);
    const b = simulation.bodies[0];
    expect(b.angularVelocity.z).toBeLessThan(-1);
    const momentum = b.momentum.clone();
    simulation.step(.5);
    expect(b.momentum.distanceTo(momentum)).toBeLessThan(1e-10);
    expect(b.orientation.length()).toBeCloseTo(1, 10);
  });
  it('uses component axes and points under translation and rotation', () => {
    const { simulation } = setup([component.replace('+0+4/+0+4/+0+4', '+2+4/+0+4/+0+4').replace('gravity: 0,0,0', 'gravity: 0,0,0; rotation: 0,0,90'), block(), force('10,0,0', '50c,50c,50c')].join('\n'));
    simulation.step(.1);
    const b = simulation.bodies[0];
    expect(b.velocity.x).toBeCloseTo(0, 8);
    expect(b.velocity.y).toBeCloseTo(.5, 8);
    expect(b.angularVelocity.length()).toBeCloseTo(0, 8);
  });
  it('uses the nearest concrete component through namespace-only groups', () => {
    const { simulation } = setup([component.replace('gravity: 0,0,0', 'gravity: 0,0,0; rotation: 0,0,90'), block().replace('Experiment/Block', 'Experiment/Group/Block'), force().replace('Experiment/Block', 'Experiment/Group/Block')].join('\n'));
    simulation.step(.1);
    expect(simulation.bodies[0].velocity.y).toBeCloseTo(.5, 8);
    expect(simulation.bodies[0].velocity.x).toBeCloseTo(0, 8);
  });
  it('does not let a malformed action replace a body', () => {
    const doc = createSpatialDocument([component, block(), '\"Experiment/Block\" : \"action: \"'].join('\n'));
    expect(doc.diagnostics.length).toBeGreaterThan(0);
    expect(doc.physics?.bodies).toHaveLength(1);
  });
  it('splits duration boundaries independently of render cadence', () => {
    const { document, simulation: a } = setup([component, block(), force('10,0,0', 'center', '.013')].join('\n'));
    const b = new Simulation(document.physics!);
    a.step(.1);
    for (let i = 0; i < 10; i++) b.step(.01);
    expect(a.bodies[0].velocity.x).toBeCloseTo(.065, 10);
    expect(a.bodies[0].position.x).toBeCloseTo(b.bodies[0].position.x, 10);
  });
  it('diagnoses missing bodies and unsupported geometry', () => {
    expect(createSpatialDocument(force()).diagnostics[0].message).toContain('existing supported rigid body');
    expect(createSpatialDocument(block().replace('color: red', 'geometry: sphere')).diagnostics.length).toBeGreaterThan(0);
  });
  it.each(['body: rigid; mass: 0', 'body: rigid; mass: -1', 'body: rigid; mass: NaN', 'mass: 2', 'action: force; vector: 1,0,0; duration: 0', 'action: force; vector: 1,0; duration: 1', 'action: force; vector: Infinity,0,0; duration: 1', 'action: force; vector: 1,0,0; duration: 1; color: red', 'action: squeeze', 'vector: 1,0,0', 'gravity: 0,NaN,0'])('rejects invalid physics: %s', properties => {
    expect(parseXyzDslDocument(`"Block/+0+1/+0+1/+0+1":"${properties}"`).ok).toBe(false);
  });
  it('does not inherit action properties or mass into children', () => {
    const doc = createSpatialDocument([component, block(), force(), '"Experiment/Block/Child/+0+1/+0+1/+0+1":""'].join('\n'));
    expect(doc.physics?.bodies).toHaveLength(0);
    expect(doc.renderNodes).toHaveLength(1);
  });
});
