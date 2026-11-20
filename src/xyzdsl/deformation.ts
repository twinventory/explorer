import type { AxisName } from './types';
import type { XyzDslPropertyDeclaration } from './propertyParser';

export type DeformationKind = 'bend' | 'twist' | 'taper' | 'bulge' | 'shear' | 'stretch' | 'offset' | 'wave';
export interface DeformationOperation {
  kind: DeformationKind;
  axis: AxisName;
  toward?: AxisName;
  /** Degrees for bend/twist; factors for stretch/taper/bulge; metres otherwise. */
  amount: number;
  range: [number, number];
  cycles?: number;
}
export interface DeformationSpec {
  operations: DeformationOperation[];
  profile: 'linear' | 'smooth';
  volume: 'free' | 'preserve';
}
export const DEFORMATION_KINDS: DeformationKind[] = ['bend', 'twist', 'taper', 'bulge', 'shear', 'stretch', 'offset', 'wave'];
export const DEFORMATION_PROPERTIES = [...DEFORMATION_KINDS, 'flare', 'pinch', 'compress', 'jog', 'deform', 'deform-profile', 'deform-volume'];
const aliases: Record<string, DeformationKind> = { flare: 'taper', pinch: 'bulge', compress: 'stretch', jog: 'offset' };
const axis = (value: string): value is AxisName => ['x', 'y', 'z'].includes(value);
const numberPattern = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
const numeric = (value: string) => numberPattern.test(value) ? Number(value) : NaN;
function length(value: string): number {
  const match = value.match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)([dcm]?)$/i);
  return match ? Number(match[1]) * ({ d: .1, c: .01, m: .001, '': 1 }[match[2]] ?? NaN) : NaN;
}
function operation(name: string, raw: string): DeformationOperation {
  const kind = aliases[name] ?? name as DeformationKind;
  if (!DEFORMATION_KINDS.includes(kind)) throw Error(`Unknown deformation "${name}".`);
  const args = raw.split(',').map(value => value.trim());
  const a = args.shift()!;
  if (!axis(a)) throw Error(`${name} requires a local x, y or z axis.`);
  const directional = ['bend', 'shear', 'offset', 'wave'].includes(kind);
  const toward = directional ? args.shift() : undefined;
  if (directional && (!toward || !axis(toward) || toward === a)) throw Error(`${name} requires two different ordered axes.`);
  const rawAmount = args.shift() ?? '';
  const amount = ['shear', 'offset', 'wave'].includes(kind) ? length(rawAmount) : numeric(rawAmount);
  if (!Number.isFinite(amount)) throw Error(`${name} requires a finite ${['shear', 'offset', 'wave'].includes(kind) ? 'length (metres, d, c or m)' : 'number'}.`);
  if (['stretch', 'taper', 'bulge'].includes(kind) && (amount < .01 || amount > 100)) throw Error(`${name} factor must be between 0.01 and 100.`);
  if (['bend', 'twist'].includes(kind) && Math.abs(amount) > 3600) throw Error(`${name} angle must be within ±3600 degrees.`);
  let cycles: number | undefined;
  if (kind === 'wave') {
    cycles = numeric(args.shift() ?? '');
    if (!Number.isInteger(cycles) || cycles < 1 || cycles > 32) throw Error('wave requires an integer cycle count from 1 to 32.');
  }
  let range: [number, number] = [0, 1];
  if (args.length) {
    const match = args.shift()!.match(/^(\d+(?:\.\d+)?)%\s*\.\.\s*(\d+(?:\.\d+)?)%$/);
    if (!match) throw Error(`${name} interval must use start%..end%.`);
    range = [Number(match[1]) / 100, Number(match[2]) / 100];
    if (range[0] < 0 || range[1] > 1 || range[0] >= range[1]) throw Error(`${name} interval must increase within 0%..100%.`);
  }
  if (args.length) throw Error(`Too many arguments for ${name}.`);
  return { kind, axis: a, toward: toward as AxisName | undefined, amount, range, ...(cycles === undefined ? {} : { cycles }) };
}

/** One property owns the complete chain. No implicit ordering of separate shorthands. */
export function parseDeformation(declarations: XyzDslPropertyDeclaration[], diagnostics: string[]): DeformationSpec | undefined {
  const relevant = declarations.filter(d => DEFORMATION_PROPERTIES.includes(d.property));
  if (!relevant.length) return undefined;
  const spec: DeformationSpec = { operations: [], profile: 'linear', volume: 'free' };
  const last = new Map(relevant.map(d => [d.property, d]));
  const sources = [...last.values()].filter(d => !['deform-profile', 'deform-volume'].includes(d.property));
  try {
    if (sources.length !== 1) throw Error('Use one deformation shorthand, or one ordered deform expression for multiple operations.');
    const source = sources[0];
    if (source.value !== 'none') {
      if (source.property === 'deform') {
        const expression = /([a-z]+)\s*\(([^()]*)\)/g;
        let end = 0;
        for (const match of source.value.matchAll(expression)) {
          if (source.value.slice(end, match.index).trim()) throw Error('Malformed deform expression. Use operation(...) operation(...).');
          spec.operations.push(operation(match[1], match[2]));
          end = match.index! + match[0].length;
        }
        if (!spec.operations.length || source.value.slice(end).trim()) throw Error('Malformed deform expression.');
      } else spec.operations.push(operation(source.property, source.value));
    }
    if (spec.operations.length > 8) throw Error('deform supports at most eight ordered operations.');
    const profile = last.get('deform-profile')?.value ?? 'linear';
    const volume = last.get('deform-volume')?.value ?? 'free';
    if (!['linear', 'smooth'].includes(profile)) throw Error('deform-profile must be linear or smooth.');
    if (!['free', 'preserve'].includes(volume)) throw Error('deform-volume must be free or preserve.');
    spec.profile = profile as DeformationSpec['profile'];
    spec.volume = volume as DeformationSpec['volume'];
  } catch (error) {
    diagnostics.push((error as Error).message);
    spec.operations = [];
  }
  return spec;
}
