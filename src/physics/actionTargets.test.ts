import { describe, expect, it } from 'vitest';
import { createSpatialDocument } from '../model/createSpatialDocument';
import { parseXyzDslDeclaration } from '../xyzdsl/parser';
import { parseXyzDslPath } from '../xyzdsl/pathParser';
import { Simulation } from './simulation';
const component = '"Experiment/+0+3/+0+2/+0+2":"gravity: 0,0,0"';
const body = '"Experiment/Offset/+50c+40c/+1+40c/+120c+40c":"body: rigid; mass: 2; color: cyan"';
const force = 'action: force; vector: 2,0,0; duration: 1';
const compile = (action: string, parent = component, target = body) => createSpatialDocument([parent, target, action].join('\n'));
describe('explicit action target paths', () => {
  it('parses the recipient and position separately from box declarations', () => {
    const path = parseXyzDslPath('Experiment/+Offset/+70c/+140c/+140c');
    expect(path.namespace).toEqual(['Experiment', 'Offset']);
    expect(path.box).toBeUndefined();
    expect(path.actionTarget?.point).toEqual([.7, 1.4, 1.4]);
    expect(parseXyzDslPath('Experiment/Offset/+50c+40c/+1+40c/+120c+40c').actionTarget).toBeUndefined();
    expect(parseXyzDslPath('Experiment/POV+1').actionTarget).toBeUndefined();
  });
  it('matches the earlier numeric point exactly, including simulated torque', () => {
    const explicit = compile(`"Experiment/+Offset/+70c/+140c/+140c":"${force}"`);
    const legacy = compile(`"Experiment/Offset":"${force}; point: 70c,140c,140c"`);
    expect(explicit.diagnostics).toEqual([]);
    expect(explicit.physics).toEqual(legacy.physics);
    const simulation = new Simulation(explicit.physics!);
    simulation.step(.5);
    expect(simulation.bodies[0].angularVelocity.z).toBeLessThan(0);
  });
  it('supports the top-level recipient, nested component paths and numeric names', () => {
    for (const name of ['Block', '7', 'Block+1', 'Outer/Inner/Block']) {
      const parts = name.split('/'); parts[parts.length - 1] = '+' + parts.at(-1);
      const parsed = parseXyzDslDeclaration(`"${parts.join('/')}":"${force}; point: center"`);
      expect(parsed.diagnostics).toEqual([]);
      expect(parsed.value?.namespace.join('/')).toBe(name);
    }
  });
  it('keeps actions additive and does not change the recipient material', () => {
    const doc = compile(`"Experiment/+Offset":"${force}"\n"Experiment/+Offset":"${force}; point: center"`);
    expect(doc.diagnostics).toEqual([]);
    expect(doc.renderNodes).toHaveLength(1);
    expect(doc.renderNodes[0].material.color).toBe('cyan');
    expect(doc.physics?.bodies[0].actions).toHaveLength(2);
  });
  it.each([
    ['center', [0,0,0]], ['left', [-.2,0,0]], ['right', [.2,0,0]],
    ['bottom', [0,-.2,0]], ['top', [0,.2,0]], ['front', [0,0,-.2]], ['back', [0,0,.2]],
  ])('selects the body-local %s point', (point, offset) => {
    const doc = compile(`"Experiment/+Offset":"${force}; point: ${point}"`, component, body.replace('color: cyan', 'color: cyan; rotation: 0,0,90'));
    expect(doc.diagnostics).toEqual([]);
    doc.physics!.bodies[0].actions[0].offset.forEach((value, i) => expect(value).toBeCloseTo((offset as number[])[i]));
  });
  it('retains component-local coordinates through a parent rotation and translation', () => {
    const parent = component.replace('+0+3', '+2+3').replace('gravity: 0,0,0', 'gravity: 0,0,0; rotation: 0,0,90');
    const explicit = compile(`"Experiment/+Offset/+70c/+140c/+140c":"${force}"`, parent);
    const legacy = compile(`"Experiment/Offset":"${force}; point: 70c,140c,140c"`, parent);
    expect(explicit.diagnostics).toEqual([]);
    expect(explicit.physics).toEqual(legacy.physics);
  });
  it.each([
    'Experiment/+Offset/+70c', 'Experiment/+Offset/+70c/+140c',
    'Experiment/+Offset/+70c/+140c/+140c/+0', 'Experiment/+Offset/+70c+1/+140c/+140c',
    'Experiment/+Offset/+070c/+140c/+140c', 'Experiment/+Offset/', 'Experiment/+',
    'Experiment/+Offset/+NaN/+140c/+140c', 'Experiment/+Offset/Child',
  ])('rejects malformed target %s', path => {
    expect(parseXyzDslDeclaration(`"${path}":"${force}"`).ok).toBe(false);
  });
  it('rejects competing point specifications, numeric point properties on new targets, and non-actions', () => {
    for (const line of [
      `"Experiment/+Offset/+70c/+140c/+140c":"${force}; point: center"`,
      `"Experiment/+Offset":"${force}; point: 70c,140c,140c"`,
      '"Experiment/+Offset":"color: red"',
    ]) expect(parseXyzDslDeclaration(line).ok).toBe(false);
  });
  it('diagnoses missing targets rather than creating a body', () => {
    const doc = createSpatialDocument(`"Experiment/+Missing/+0/+0/+0":"${force}"`);
    expect(doc.renderNodes).toHaveLength(0);
    expect(doc.diagnostics[0].message).toContain('existing supported rigid body');
  });
});
