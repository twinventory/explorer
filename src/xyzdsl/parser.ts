import type { AxisName, XyzDslAxisSpec, XyzDslBoxSpec, ParseDiagnostic, ParseResult, SpatialObject } from './types';
import { parseObjectProperties } from './objectDeclarationParser';
import { parseXyzDslPath, parsePathAxisSpec, parsePathBoxSpec, parsePathNumber } from './pathParser';

const DECLARATION_PATTERN = /^\s*"(?<box>[^"]+)"\s*:\s*"(?<properties>[^"]*)"\s*$/;

export function parseCompactNumber(raw: string): number {
  return parsePathNumber(raw);
}

export function parseAxisSpec(raw: string, axis: AxisName): XyzDslAxisSpec {
  return parsePathAxisSpec(raw, axis);
}

export function parseBoxSpec(source: string): XyzDslBoxSpec {
  return parsePathBoxSpec(source);
}

export function parseXyzDslDeclaration(line: string, lineNumber = 1): ParseResult<SpatialObject> {
  const match = line.match(DECLARATION_PATTERN);
  const diagnostics: ParseDiagnostic[] = [];

  if (!match?.groups) {
    return {
      ok: false,
      diagnostics: [
        {
          line: lineNumber,
          source: line,
          message: 'Declaration must look like "+2d+4d/+0d+6d/+1d+3d" : "geometry: box; color: blue; metalness: 0.1".',
        },
      ],
    };
  }

  try {
    const path = parseXyzDslPath(match.groups.box);
    const properties = parseObjectProperties(match.groups.properties);
    if (/(?:^|;)\s*action\s*:/.test(match.groups.properties) && !properties.physics.action) throw Error('Invalid action declaration.');
    if (path.actionTarget) {
      if (!properties.physics.action) throw Error('An explicit +Body target requires action: force.');
      const hasPointProperty = /(?:^|;)\s*point\s*:/.test(match.groups.properties);
      if (path.actionTarget.point) {
        if (hasPointProperty) throw Error('Choose path coordinates or a named point, not both.');
        properties.physics.action.point = path.actionTarget.point;
      } else if (Array.isArray(properties.physics.action.point)) {
        throw Error('Explicit action targets use path coordinates for numeric points; point is reserved for named locations.');
      }
    }
    if (properties.physics.action && (!path.isDeclarationOnly || !path.namespace.length)) throw Error('Actions must address a named body without box coordinates.');
    if (properties.physics.body && path.isDeclarationOnly) throw Error('body requires a concrete box declaration.');
    if (properties.physics.gravity && path.isDeclarationOnly) throw Error('gravity requires a concrete component declaration.');


    return {
      ok: true,
      value: {
        id: properties.physics.action ? `action-${lineNumber}` : path.namespace.length > 0 ? path.canonicalPath : `node-${lineNumber}`,
        source: line,
        physics: properties.physics,
        path,
        namespace: path.namespace,
        box: path.box,
        gridDeclarations: properties.gridDeclarations,
        surfaceDeclarations: properties.surfaceDeclarations,
        selfOrigin: properties.selfOrigin,
        surface: properties.surface,
        repeat: properties.repeat,
        light: properties.light,
        material: properties.material,
        geometry: properties.geometry,
        transform: properties.transform,
        reference: properties.reference,
        content: properties.content,
        model: properties.model,
        viewPoint: properties.viewPoint,
        declarationOnly: path.isDeclarationOnly,
        lineNumber,
      },
      diagnostics: properties.diagnostics.map((message) => ({ line: lineNumber, source: line, message })),
    };
  } catch (error) {
    diagnostics.push({
      line: lineNumber,
      source: line,
      message: error instanceof Error ? error.message : 'Unknown parse error.',
    });

    return { ok: false, diagnostics };
  }
}

export function parseXyzDslDocument(source: string): ParseResult<SpatialObject[]> {
  const objects: SpatialObject[] = [];
  const diagnostics: ParseDiagnostic[] = [];

  source
    .split('\n')
    .map((line, index) => ({ line, lineNumber: index + 1 }))
    .filter(({ line }) => line.trim().length > 0)
    .forEach(({ line, lineNumber }) => {
      const result = parseXyzDslDeclaration(line, lineNumber);

      diagnostics.push(...result.diagnostics);

      if (result.ok && result.value) {
        objects.push({ ...result.value, id: result.value.namespace.length > 0 ? result.value.id : `node-${objects.length + 1}` });
      }
    });

  return {
    ok: diagnostics.length === 0,
    value: objects,
    diagnostics,
  };
}
