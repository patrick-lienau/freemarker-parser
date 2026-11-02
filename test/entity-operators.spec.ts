import { NodeTypes } from '../src/enum/NodeTypes';
import { Operators } from '../src/enum/Operators';
import { ParamNames } from '../src/enum/ParamNames';
import { Parser } from '../src';
import {
  AllParamTypes,
  BinaryExpression,
  BuiltInExpression,
  CallExpression,
  LambdaExpression,
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

const a = { type: ParamNames.Identifier, name: 'a' };
const b = { type: ParamNames.Identifier, name: 'b' };

// FreeMarker accepts `&lt;`, `&lt;=`, `&gt;`, `&gt;=`, `&amp;&amp;` and `-&gt;`
// (FTL.jj, 2.3-gae) so a template can stay well-formed markup. The params
// parser had none of them and threw `Unexpected "&"`; the throw is recovered
// per token, so the directive holding the operator vanished.
describe('entity-spelled operators', () => {
  it.each([
    [Operators.ENTITY_LT, '&lt;'],
    [Operators.ENTITY_LTE, '&lt;='],
    [Operators.ENTITY_GT, '&gt;'],
    [Operators.ENTITY_GTE, '&gt;='],
  ])('parses %s as a comparison', (operator, spelling) => {
    expect(parseParams(`a ${spelling} b`)).toEqual({
      type: ParamNames.BinaryExpression,
      operator,
      left: a,
      right: b,
    });
  });

  it('parses &amp;&amp; as a logical and', () => {
    expect(parseParams('a &amp;&amp; b')).toEqual({
      type: ParamNames.LogicalExpression,
      operator: Operators.ENTITY_AND,
      left: a,
      right: b,
    });
  });

  it('gives the comparison its precedence over and, and below arithmetic', () => {
    expect(parseParams('a + 1 &gt; b &amp;&amp; b &lt;= 2')).toEqual({
      type: ParamNames.LogicalExpression,
      operator: '&amp;&amp;',
      left: {
        type: ParamNames.BinaryExpression,
        operator: '&gt;',
        left: {
          type: ParamNames.BinaryExpression,
          operator: '+',
          left: a,
          right: { type: ParamNames.Literal, value: 1, raw: '1' },
        },
        right: b,
      },
      right: {
        type: ParamNames.BinaryExpression,
        operator: '&lt;=',
        left: b,
        right: { type: ParamNames.Literal, value: 2, raw: '2' },
      },
    });
  });

  it('needs no surrounding spaces', () => {
    expect((parseParams('a&gt;=b') as BinaryExpression).operator).toBe('&gt;=');
  });

  it('parses -&gt; as a lambda arrow', () => {
    const call = (parseParams(
      'xs?filter(x -&gt; x.n &gt; 1)',
    ) as BuiltInExpression).right as CallExpression;
    const lambda = call.arguments[0] as LambdaExpression;
    expect(lambda.type).toBe(ParamNames.LambdaExpression);
    expect((lambda.body as BinaryExpression).operator).toBe('&gt;');
  });

  it('names the entity arrow when a lambda has no body', () => {
    expect(() => parseParams('xs?map(x -&gt;)')).toThrow(
      'Expected expression after -&gt;',
    );
  });
});

describe('directives holding an entity-spelled operator', () => {
  it.each([
    ['<#if count &gt; 0>a<#elseif count &lt;= -1>b<#else>c</#if>'],
    ['[#if count &gt; 0]a[#elseif count &lt;= -1]b[#else]c[/#if]'],
  ])('keeps the #if and its branches: %s', (source) => {
    const ast = parse(source);
    expect(messages(ast)).toEqual([]);
    expect(ast.body.map((n) => n.type)).toEqual([NodeTypes.Condition]);
    const condition = (ast.body[0] as unknown) as {
      consequent: AbstractNode[];
      alternate: AbstractNode[];
    };
    expect(condition.consequent.map((n) => n.type)).toEqual([NodeTypes.Text]);
    expect(condition.alternate.map((n) => n.type)).toEqual([
      NodeTypes.Condition,
    ]);
    expect((paramsOf(ast.body[0]) as BinaryExpression).operator).toBe('&gt;');
  });

  it.each([
    ['<#assign ok = a &gt;= 1 &amp;&amp; b &lt; 2 />'],
    ['[#assign ok = a &gt;= 1 &amp;&amp; b &lt; 2]'],
    ['<#assign ys = xs?filter(x -&gt; x.n &gt; 1)>'],
    ['[#assign ys = xs?filter(x -&gt; x.n &gt; 1)]'],
  ])('keeps the assignment: %s', (source) => {
    const ast = parse(source);
    expect(messages(ast)).toEqual([]);
    expect(ast.body.map((n) => n.type)).toEqual([NodeTypes.Assign]);
  });

  it.each([
    [
      '<span><#if count &gt; 0>${(count &gt; 99)?then("99+", count?c)}</#if></span>',
    ],
    [
      '<span>[#if count &gt; 0]${(count &gt; 99)?then("99+", count?c)}[/#if]</span>',
    ],
  ])('keeps an interpolation inside the #if: %s', (source) => {
    const squareTags = source.includes('[#');
    const { ast } = new Parser().parse(source, { squareTags });
    expect(messages(ast)).toEqual([]);
    expect(ast.body.map((n) => n.type)).toEqual([
      NodeTypes.Text,
      NodeTypes.Condition,
      NodeTypes.Text,
    ]);
    const condition = (ast.body[1] as unknown) as {
      consequent: AbstractNode[];
    };
    expect(condition.consequent.map((n) => n.type)).toEqual([
      NodeTypes.Interpolation,
    ]);
  });
});
