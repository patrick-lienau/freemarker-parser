import { NodeTypes } from '../src/enum/NodeTypes';
import { Parser } from '../src';
import ProgramNode from '../src/nodes/ProgramNode';

function parse(template: string): ProgramNode {
  const squareTags = template.trimStart().startsWith('[');
  return new Parser().parse(template, { squareTags, parseLocation: true }).ast;
}

function messages(ast: ProgramNode): string[] {
  return (ast.errors ?? []).map((e) => e.message);
}

/** The node's `body` array, or `undefined` when it captures no body. */
function bodyOf(ast: ProgramNode, index = 0): unknown {
  return (ast.body[index] as { body?: unknown }).body;
}

describe('#ftl directive', () => {
  // Every #ftl attribute is optional, and the require-ftl-directive lint rule in
  // @neptune/cx-tooling makes a bare `<#ftl>` the first line of every partial —
  // so this used to fail on essentially every DDM template in a portal.
  it.each([['<#ftl>'], ['[#ftl]'], ['<#ftl />'], ['[#ftl /]']])(
    'accepts %s with no parameters',
    (source) => {
      const ast = parse(source);
      expect(messages(ast)).toEqual([]);
      expect(ast.body[0].type).toBe(NodeTypes.Assign);
    },
  );

  it('still accepts parameters', () => {
    const ast = parse('<#ftl encoding="utf-8">');
    expect(messages(ast)).toEqual([]);
  });

  it('does not open a block', () => {
    const ast = parse('<#ftl>\n<#assign x = 1 />\n');
    expect(messages(ast)).toEqual([]);
    expect(bodyOf(ast, 0)).toBeUndefined();
  });
});

describe('self-closing tags', () => {
  // The tag terminator is `/>` in angle mode and `/]` in square mode. Testing
  // only the angle spelling meant every square-syntax `[@macro … /]` opened a
  // body that was never closed, which cascaded into "Unexpected close tag"
  // errors for every enclosing block.
  it.each([
    ['<@isaButton label="x" />'],
    ['[@isaButton label="x" /]'],
    ['[@isaButton\n  label="x"\n/]'],
  ])('macro call %s captures no body', (source) => {
    const ast = parse(source);
    expect(messages(ast)).toEqual([]);
    expect(ast.body[0].type).toBe(NodeTypes.MacroCall);
    expect(bodyOf(ast)).toBeUndefined();
  });

  it('macro call with a body still captures it', () => {
    const ast = parse('[@isaButton]hi[/@isaButton]');
    expect(messages(ast)).toEqual([]);
    expect(bodyOf(ast)).toHaveLength(1);
  });

  it('self-closing macro call inside a conditional closes the conditional', () => {
    const ast = parse('[#if a]\n[@isaButton label="x" /]\n[/#if]');
    expect(messages(ast)).toEqual([]);
    expect(ast.body[0].type).toBe(NodeTypes.Condition);
  });

  it('self-closing #assign captures no body', () => {
    const ast = parse('[#assign x /]');
    expect(messages(ast)).toEqual([]);
    expect(bodyOf(ast)).toBeUndefined();
  });

  it('block #assign still captures its body', () => {
    const ast = parse('<#assign x><p>hi</p></#assign>');
    expect(messages(ast)).toEqual([]);
    expect(bodyOf(ast)).toHaveLength(1);
  });
});
