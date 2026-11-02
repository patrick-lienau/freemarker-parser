import { NodeTypes } from '../src/enum/NodeTypes';
import { ParamNames } from '../src/enum/ParamNames';
import { Parser } from '../src';
import {
  AllParamTypes,
  BinaryExpression,
  Identifier,
  Literal,
  MapExpression,
} from '../src/interface/Params';
import AbstractNode from '../src/nodes/abstract/AbstractNode';
import ProgramNode from '../src/nodes/ProgramNode';
import { ParamsParser } from '../src/ParamsParser';

function parseParams(template: string): AllParamTypes {
  return new ParamsParser(template).parseExpressions();
}

function parse(template: string): ProgramNode {
  const squareTags = template.trimStart().startsWith('[');
  return new Parser().parse(template, { squareTags, parseLocation: true }).ast;
}

function messages(ast: ProgramNode): string[] {
  return (ast.errors ?? []).map((e) => e.message);
}

/** Every hash literal in a param tree, outermost first. */
function maps(node: unknown): MapExpression[] {
  if (!node || typeof node !== 'object') {
    return [];
  }
  const out: MapExpression[] = [];
  const record = node as Record<string, unknown>;
  if (record.type === ParamNames.MapExpression) {
    out.push(node as MapExpression);
  }
  for (const value of Object.values(record)) {
    for (const child of Array.isArray(value) ? value : [value]) {
      out.push(...maps(child));
    }
  }
  return out;
}

function paramsOf(node: AbstractNode): unknown {
  return ((node as unknown) as { params: unknown }).params;
}

function bodyOf(node: AbstractNode): AbstractNode[] {
  return ((node as unknown) as { body: AbstractNode[] }).body;
}

const id = (name: string): Identifier => ({
  type: ParamNames.Identifier,
  name,
});
const str = (value: string): Literal => ({
  type: ParamNames.Literal,
  value,
  raw: `"${value}"`,
});

// `parseMap` accepted only a quoted string as a key and threw "Invalid
// character …" on anything else, and `parseToken` returned a hash literal
// without the member/call loop, so `{…}[k]` became a Compound. Both throws are
// recovered per token, so the directive holding the literal vanished.
describe('hash literal keys', () => {
  it('still reads a quoted key as a string literal', () => {
    expect(parseParams('{"a": b}')).toEqual({
      type: ParamNames.MapExpression,
      elements: [{ key: str('a'), value: id('b') }],
    });
  });

  it('reads a bare name as a variable, not as a string', () => {
    expect(parseParams('{personKey: true}')).toEqual({
      type: ParamNames.MapExpression,
      elements: [
        {
          key: id('personKey'),
          value: { type: ParamNames.Literal, value: true, raw: 'true' },
        },
      ],
    });
  });

  it('parses a call and a built-in in a key', () => {
    expect(parseParams('{node.getCategoryId()?c: node}')).toEqual({
      type: ParamNames.MapExpression,
      elements: [
        {
          key: {
            type: ParamNames.BuiltInExpression,
            operator: '?',
            left: {
              type: ParamNames.CallExpression,
              callee: {
                type: ParamNames.MemberExpression,
                computed: false,
                object: id('node'),
                property: id('getCategoryId'),
              },
              arguments: [],
            },
            right: id('c'),
          },
          value: id('node'),
        },
      ],
    });
  });

  it.each([
    ['{tierWidths[tier]?c: x}', ParamNames.BuiltInExpression],
    ['{entry.getFilterValue(): entry}', ParamNames.CallExpression],
    ['{"a" + b: 1}', ParamNames.BinaryExpression],
    ['{x!"d": 1}', ParamNames.BinaryExpression],
    ['{(a): 1}', ParamNames.Identifier],
  ])('takes an expression as a key: %s', (source, type) => {
    const map = parseParams(source) as MapExpression;
    expect(map.type).toBe(ParamNames.MapExpression);
    expect(map.elements.map((e) => e.key.type)).toEqual([type]);
  });

  it('separates entries whose keys are expressions', () => {
    const map = parseParams('{a: 1, b?c: 2, "c": 3,}') as MapExpression;
    expect(map.elements.map((e) => e.key.type)).toEqual([
      ParamNames.Identifier,
      ParamNames.BuiltInExpression,
      ParamNames.Literal,
    ]);
  });

  it('still requires a colon after the key', () => {
    expect(() => parseParams('{a 1}')).toThrow('Invalid character 1');
  });
});

describe('member access on a hash literal', () => {
  it('indexes the literal', () => {
    expect(parseParams('{"h2": "h3"}[level]')).toEqual({
      type: ParamNames.MemberExpression,
      computed: true,
      object: {
        type: ParamNames.MapExpression,
        elements: [{ key: str('h2'), value: str('h3') }],
      },
      property: id('level'),
    });
  });

  it('keeps a default after the index', () => {
    const result = parseParams(
      '{"h2": "h3", "h3": "h4"}[headingLevel]!"h3"',
    ) as BinaryExpression;
    expect(result.type).toBe(ParamNames.BinaryExpression);
    expect(result.operator).toBe('!');
    expect(result.left.type).toBe(ParamNames.MemberExpression);
    expect(result.right).toEqual(str('h3'));
  });

  it.each([
    ['{"a": 1}.a', ParamNames.MemberExpression],
    ['{"a": {"b": 1}}["a"]["b"]', ParamNames.MemberExpression],
    ['{"a": f}["a"](1)', ParamNames.CallExpression],
    ['{"a": 1}["a"]?c', ParamNames.BuiltInExpression],
  ])('chains like any other operand: %s', (source, type) => {
    const result = parseParams(source);
    expect(result.type).toBe(type);
    expect(maps(result)).not.toHaveLength(0);
  });
});

describe('directives holding a hash literal', () => {
  it.each([
    ['<#assign byId = byId + {node.getCategoryId()?c: node} />'],
    ['[#assign byId = byId + {node.getCategoryId()?c: node}]'],
    ['<#assign level = {"h2": "h3", "h3": "h4"}[headingLevel]!"h3">'],
    ['[#assign level = {"h2": "h3", "h3": "h4"}[headingLevel]!"h3"]'],
  ])('keeps the assignment: %s', (source) => {
    const ast = parse(source);
    expect(messages(ast)).toEqual([]);
    expect(ast.body.map((n) => n.type)).toEqual([NodeTypes.Assign]);
    expect(maps(paramsOf(ast.body[0]))).toHaveLength(1);
  });

  it.each([
    ['<#list nodes as node><#assign byId = byId + {node.id?c: node}></#list>'],
    ['[#list nodes as node][#assign byId = byId + {node.id?c: node}][/#list]'],
  ])('keeps an assignment inside a #list: %s', (source) => {
    const ast = parse(source);
    expect(messages(ast)).toEqual([]);
    expect(ast.body.map((n) => n.type)).toEqual([NodeTypes.List]);
    const body = bodyOf(ast.body[0]);
    expect(body.map((n) => n.type)).toEqual([NodeTypes.Assign]);
    expect(maps(paramsOf(body[0]))).toHaveLength(1);
  });

  it.each([
    ['<#macro m><#local seen = seen + {personKey: true}></#macro>'],
    ['[#macro m][#local seen = seen + {personKey: true}][/#macro]'],
  ])('keeps a #local inside a macro: %s', (source) => {
    const ast = parse(source);
    expect(messages(ast)).toEqual([]);
    const body = bodyOf(ast.body[0]);
    expect(body.map((n) => n.type)).toEqual([NodeTypes.Local]);
    expect(maps(paramsOf(body[0]))[0].elements[0].key).toEqual(id('personKey'));
  });
});
