import { NodeTypes } from '../src/enum/NodeTypes';
import { ParamNames } from '../src/enum/ParamNames';
import { Parser } from '../src';
import { AllParamTypes, LambdaExpression } from '../src/interface/Params';
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

/** Every lambda in a param tree, outermost first. */
function lambdas(node: unknown): LambdaExpression[] {
  if (!node || typeof node !== 'object') {
    return [];
  }
  const out: LambdaExpression[] = [];
  const record = node as Record<string, unknown>;
  if (record.type === ParamNames.LambdaExpression) {
    out.push(node as LambdaExpression);
  }
  for (const value of Object.values(record)) {
    for (const child of Array.isArray(value) ? value : [value]) {
      out.push(...lambdas(child));
    }
  }
  return out;
}

function paramsOf(node: AbstractNode): unknown {
  return ((node as unknown) as { params: unknown }).params;
}

const x = { type: ParamNames.Identifier, name: 'x' };
const xDotY = {
  type: ParamNames.MemberExpression,
  computed: false,
  object: x,
  property: { type: ParamNames.Identifier, name: 'y' },
};

// The params parser had no `->`, so it read `x -> …` as `x - …` and threw
// "Expected expression after -". The throw is recovered per token, so the
// directive or interpolation holding the lambda vanished from the AST: an
// `#if`/`#list` lost its open tag and its children flattened into the parent.
describe('lambda expressions', () => {
  it('parses the bare form', () => {
    expect(lambdas(parseParams('xs?filter(x -> x.y)'))).toEqual([
      { type: ParamNames.LambdaExpression, params: [x], body: xDotY },
    ]);
  });

  it('parses the parenthesised form', () => {
    expect(lambdas(parseParams('xs?map((x) -> x.y)'))).toEqual([
      { type: ParamNames.LambdaExpression, params: [x], body: xDotY },
    ]);
  });

  it.each([['xs?map(x->x.y)'], ['xs?map( ( x )  ->  x.y )']])(
    'tolerates any spacing: %s',
    (source) => {
      expect(lambdas(parseParams(source))).toEqual([
        { type: ParamNames.LambdaExpression, params: [x], body: xDotY },
      ]);
    },
  );

  it('is the argument of the call, with the built-in around it', () => {
    expect(parseParams('xs?filter(x -> x.y)')).toEqual({
      type: ParamNames.BuiltInExpression,
      operator: '?',
      left: { type: ParamNames.Identifier, name: 'xs' },
      right: {
        type: ParamNames.CallExpression,
        callee: { type: ParamNames.Identifier, name: 'filter' },
        arguments: [
          { type: ParamNames.LambdaExpression, params: [x], body: xDotY },
        ],
      },
    });
  });

  it('takes a whole expression as its body', () => {
    const [lambda] = lambdas(parseParams('xs?filter(x -> x.y > 0 && !x.z)'));
    expect(lambda.body.type).toBe(ParamNames.LogicalExpression);
  });

  it('ends its body at the closing paren, so built-ins can follow', () => {
    const result = parseParams('xs?map(x -> x.y)?join(", ")');
    expect(lambdas(result)).toHaveLength(1);
    expect(result.type).toBe(ParamNames.BuiltInExpression);
  });

  it('parses a lambda nested in a lambda body', () => {
    const found = lambdas(
      parseParams('xs?filter(x -> x.ys?map(y -> y.z)?size gt 0)'),
    );
    expect(found.map((l) => l.params[0].name)).toEqual(['x', 'y']);
  });

  it.each([
    ['foo((x))', ParamNames.Identifier],
    ['foo((x) - 1)', ParamNames.BinaryExpression],
    ['foo(x - 1)', ParamNames.BinaryExpression],
    ['foo(x--)', ParamNames.UpdateExpression],
  ])('leaves an argument that is not a lambda alone: %s', (source, type) => {
    const result = parseParams(source) as { arguments: AllParamTypes[] };
    expect(result.arguments[0].type).toBe(type);
  });

  it('is not a sequence element', () => {
    expect(() => parseParams('[x -> x.y]')).toThrow(
      'Expected expression after -',
    );
  });

  it('requires a body', () => {
    expect(() => parseParams('xs?map(x ->)')).toThrow(
      'Expected expression after ->',
    );
  });
});

describe('directives holding a lambda', () => {
  it.each([
    ['<#assign ys = xs?map(x -> x.y) />'],
    ['[#assign ys = xs?map(x -> x["y"])]'],
    ['<#global ys = xs?filter((x) -> x.y > 0)>'],
  ])('keeps the assignment: %s', (source) => {
    const ast = parse(source);
    expect(messages(ast)).toEqual([]);
    expect(ast.body).toHaveLength(1);
    expect(lambdas(paramsOf(ast.body[0]))).toHaveLength(1);
  });

  it.each([
    ['[#macro m xs][#local ys = xs?map(x -> x.y)/][/#macro]'],
    ['<#macro m xs><#local ys = xs?map(x -> x.y > 1) /></#macro>'],
  ])('keeps a #local inside a macro: %s', (source) => {
    const ast = parse(source);
    expect(messages(ast)).toEqual([]);
    const macro = (ast.body[0] as unknown) as { body: AbstractNode[] };
    expect(macro.body.map((n) => n.type)).toEqual([NodeTypes.Local]);
    expect(lambdas(paramsOf(macro.body[0]))).toHaveLength(1);
  });

  // In angle syntax the `>` of `->`, and any `>` in the body, would end the tag
  // if the tokenizer read it outside the built-in's parentheses.
  it.each([
    ['<#if xs?filter(x -> x.n > 1)?has_content>a<#else>b</#if>'],
    ['[#if xs?filter(x -> x.n > 1)?has_content]a[#else]b[/#if]'],
  ])('keeps the #if and its branches: %s', (source) => {
    const ast = parse(source);
    expect(messages(ast)).toEqual([]);
    expect(ast.body).toHaveLength(1);
    const condition = (ast.body[0] as unknown) as {
      type: string;
      consequent: AbstractNode[];
      alternate: AbstractNode[];
    };
    expect(condition.type).toBe(NodeTypes.Condition);
    expect(condition.consequent.map((n) => n.type)).toEqual([NodeTypes.Text]);
    expect(condition.alternate.map((n) => n.type)).toEqual([NodeTypes.Text]);
    expect(lambdas(paramsOf(ast.body[0]))).toHaveLength(1);
  });

  it.each([
    ['<#list xs?filter(x -> x.n > 1) as x>${x}<#else>none</#list>'],
    ['[#list xs?filter(x -> x.n > 1) as x]${x}[#else]none[/#list]'],
  ])('keeps the #list and its body: %s', (source) => {
    const ast = parse(source);
    expect(messages(ast)).toEqual([]);
    expect(ast.body).toHaveLength(1);
    const list = (ast.body[0] as unknown) as {
      type: string;
      body: AbstractNode[];
    };
    expect(list.type).toBe(NodeTypes.List);
    expect(list.body.map((n) => n.type)).toEqual([NodeTypes.Interpolation]);
    expect(lambdas(paramsOf(ast.body[0]))).toHaveLength(1);
  });

  it('keeps an interpolation', () => {
    const ast = parse('<p>${xs?map((x) -> x.y)?join(", ")}</p>');
    expect(messages(ast)).toEqual([]);
    expect(ast.body.map((n) => n.type)).toEqual([
      NodeTypes.Text,
      NodeTypes.Interpolation,
      NodeTypes.Text,
    ]);
    expect(lambdas(paramsOf(ast.body[1]))).toHaveLength(1);
  });
});
