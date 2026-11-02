import { NodeTypes } from '../src/enum/NodeTypes';
import { ParamNames } from '../src/enum/ParamNames';
import { Parser } from '../src';
import {
  AllParamTypes,
  BinaryExpression,
  Identifier,
  Literal,
  MemberExpression,
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

function paramsOf(node: AbstractNode): unknown {
  return ((node as unknown) as { params: unknown }).params;
}

function bodyOf(node: AbstractNode): AbstractNode[] {
  return ((node as unknown) as { body: AbstractNode[] }).body;
}

/** Every member access in a param tree, outermost first. */
function members(node: unknown): MemberExpression[] {
  if (!node || typeof node !== 'object') {
    return [];
  }
  const out: MemberExpression[] = [];
  const record = node as Record<string, unknown>;
  if (record.type === ParamNames.MemberExpression) {
    out.push(node as MemberExpression);
  }
  for (const value of Object.values(record)) {
    for (const child of Array.isArray(value) ? value : [value]) {
      out.push(...members(child));
    }
  }
  return out;
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
const num = (value: number): Literal => ({
  type: ParamNames.Literal,
  value,
  raw: `${value}`,
});

// `parseToken` returned a sequence or string literal without the member/call
// loop, so `["a", "b"][i]` read as two sequences and became a Compound
// ("Invalid parameters in Assign"), and the directive holding it vanished.
describe('member access on a sequence literal', () => {
  it('indexes the literal', () => {
    expect(parseParams('["a", "b"][i]')).toEqual({
      type: ParamNames.MemberExpression,
      computed: true,
      object: {
        type: ParamNames.ArrayExpression,
        elements: [str('a'), str('b')],
      },
      property: id('i'),
    });
  });

  it('keeps a default after the index', () => {
    const result = parseParams('["a", "b"][i]!"c"') as BinaryExpression;
    expect(result.type).toBe(ParamNames.BinaryExpression);
    expect(result.operator).toBe('!');
    expect(result.left.type).toBe(ParamNames.MemberExpression);
  });

  it.each([
    ['[[1, 2]][0][1]', ParamNames.MemberExpression],
    ['["a", "b"][0..1]', ParamNames.MemberExpression],
    ['[f][0](1)', ParamNames.CallExpression],
    ['["a"][0]?upper_case', ParamNames.BuiltInExpression],
  ])('chains like any other operand: %s', (source, type) => {
    const result = parseParams(source);
    expect(result.type).toBe(type);
    expect(members(result)).not.toHaveLength(0);
  });
});

describe('member access on a string literal', () => {
  it('indexes the literal', () => {
    expect(parseParams('"abc"[0]')).toEqual({
      type: ParamNames.MemberExpression,
      computed: true,
      object: str('abc'),
      property: num(0),
    });
  });

  it('slices the literal', () => {
    const result = parseParams('"abc"[1..]') as MemberExpression;
    expect(result.type).toBe(ParamNames.MemberExpression);
    expect(result.object).toEqual(str('abc'));
    expect(result.property?.type).toBe(ParamNames.UnaryExpression);
  });

  it.each([
    ['"abc"', ParamNames.Literal],
    ['"a" + "b"', ParamNames.BinaryExpression],
    ['"a"?upper_case', ParamNames.BuiltInExpression],
    ['"a"!"b"', ParamNames.BinaryExpression],
  ])('leaves a string with nothing to chain alone: %s', (source, type) => {
    const result = parseParams(source);
    expect(result.type).toBe(type);
    expect(members(result)).toHaveLength(0);
  });

  it('leaves the strings of a sequence as elements', () => {
    expect(parseParams('["a", "b"]')).toEqual({
      type: ParamNames.ArrayExpression,
      elements: [str('a'), str('b')],
    });
  });
});

describe('directives holding an indexed literal', () => {
  it.each([
    ['<#assign v = ["h3", "h4"][level]!"h3" />'],
    ['[#assign v = ["h3", "h4"][level]!"h3"]'],
    ['<#assign c = "abc"[0]>'],
    ['[#assign c = "abc"[0]]'],
  ])('keeps the assignment: %s', (source) => {
    const ast = parse(source);
    expect(messages(ast)).toEqual([]);
    expect(ast.body.map((n) => n.type)).toEqual([NodeTypes.Assign]);
    expect(members(paramsOf(ast.body[0]))).toHaveLength(1);
  });

  it.each([
    ['<#list ["a", "b", "c"][0..1] as x>${x}</#list>'],
    ['[#list ["a", "b", "c"][0..1] as x]${x}[/#list]'],
  ])('keeps the #list and its body: %s', (source) => {
    const ast = parse(source);
    expect(messages(ast)).toEqual([]);
    expect(ast.body.map((n) => n.type)).toEqual([NodeTypes.List]);
    expect(bodyOf(ast.body[0]).map((n) => n.type)).toEqual([
      NodeTypes.Interpolation,
    ]);
    expect(members(paramsOf(ast.body[0]))).toHaveLength(1);
  });

  it.each([['<p>${["a", "b"][i]}</p>'], ['<p>${"abc"[i]}</p>']])(
    'keeps an interpolation: %s',
    (source) => {
      const ast = parse(source);
      expect(messages(ast)).toEqual([]);
      expect(ast.body.map((n) => n.type)).toEqual([
        NodeTypes.Text,
        NodeTypes.Interpolation,
        NodeTypes.Text,
      ]);
      expect(members(paramsOf(ast.body[1]))).toHaveLength(1);
    },
  );
});
