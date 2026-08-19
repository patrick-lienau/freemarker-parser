import { NodeTypes } from '../src/enum/NodeTypes';
import { Parser } from '../src';
import AbstractNode from '../src/nodes/abstract/AbstractNode';
import ProgramNode from '../src/nodes/ProgramNode';

function parse(template: string): ProgramNode {
  const squareTags = template.trimStart().startsWith('[');
  return new Parser().parse(template, { squareTags, parseLocation: true }).ast;
}

function messages(ast: ProgramNode): string[] {
  return (ast.errors ?? []).map((e) => e.message);
}

/** Flatten every node type in the tree, depth first, for shape assertions. */
function types(nodes: AbstractNode[] | undefined): string[] {
  const out: string[] = [];
  for (const node of nodes ?? []) {
    out.push(node.type);
    const n = node as unknown as Record<string, AbstractNode[] | undefined>;
    for (const key of ['body', 'consequent', 'alternate', 'fallback']) {
      out.push(...types(n[key]));
    }
  }
  return out;
}

/** The single node the template produces at top level. */
function only(ast: ProgramNode): AbstractNode {
  expect(ast.body).toHaveLength(1);
  return ast.body[0];
}

// Both directives were simply absent from the Directives map, so every use
// raised `Unknown token`. That is a *recovered* error — the token is skipped and
// block nesting survives — so unlike the tokenizer throws fixed in 1.4.1 it cost
// one node rather than the whole file. It still meant the body of the construct
// was silently missing from the AST.
describe('#continue', () => {
  it.each([
    ['[#list xs as x][#if x][#continue][/#if]${x}[/#list]'],
    ['<#list xs as x><#if x><#continue></#if>${x}</#list>'],
  ])('parses inside a list: %s', (source) => {
    const ast = parse(source);
    expect(messages(ast)).toEqual([]);
    expect(types(ast.body)).toContain(NodeTypes.Continue);
  });

  it('produces a leaf node with no body', () => {
    const ast = parse('[#list xs as x][#continue][/#list]');
    expect(messages(ast)).toEqual([]);
    const list = only(ast);
    const continueNode = (list as unknown as { body: AbstractNode[] }).body[0];
    expect(continueNode.type).toBe(NodeTypes.Continue);
    expect(continueNode.hasBody).toBe(false);
  });

  it('rejects parameters', () => {
    expect(messages(parse('[#continue x]'))).toEqual([
      'Unexpected parameter in Continue',
    ]);
  });

  it('leaves #break alone', () => {
    const ast = parse('[#list xs as x][#break][/#list]');
    expect(messages(ast)).toEqual([]);
    expect(types(ast.body)).toEqual([NodeTypes.List, NodeTypes.Break]);
  });
});

describe('#sep', () => {
  // FreeMarker allows the close tag to be omitted, in which case the separator
  // runs to the end of the enclosing list. Both spellings must work.
  it('parses with an explicit close', () => {
    const ast = parse('[#list xs as x]${x}[#sep], [/#sep][/#list]');
    expect(messages(ast)).toEqual([]);
    expect(types(ast.body)).toEqual([
      NodeTypes.List, NodeTypes.Interpolation, NodeTypes.Sep, NodeTypes.Text,
    ]);
  });

  it.each([
    ['[#list xs as x]${x}[#sep], [/#list]'],
    ['<#list xs as x>${x}<#sep>, </#list>'],
  ])('closes implicitly at the end of the list: %s', (source) => {
    const ast = parse(source);
    expect(messages(ast)).toEqual([]);
    expect(types(ast.body)).toEqual([
      NodeTypes.List, NodeTypes.Interpolation, NodeTypes.Sep, NodeTypes.Text,
    ]);
  });

  it('closes implicitly at the end of an #items block', () => {
    const ast = parse('[#list xs as x][#items as i]${i}[#sep], [/#items][/#list]');
    expect(messages(ast)).toEqual([]);
    expect(types(ast.body)).toEqual([
      NodeTypes.List, NodeTypes.Items, NodeTypes.Interpolation,
      NodeTypes.Sep, NodeTypes.Text,
    ]);
  });

  it('captures its content as a body', () => {
    const ast = parse('[#list xs as x]${x}[#sep], [/#list]');
    const list = only(ast) as unknown as { body: AbstractNode[] };
    const sep = list.body[1] as unknown as { type: string; body: AbstractNode[] };
    expect(sep.type).toBe(NodeTypes.Sep);
    expect(sep.body).toHaveLength(1);
    expect(sep.body[0].type).toBe(NodeTypes.Text);
  });

  it('rejects parameters', () => {
    expect(messages(parse('[#list xs as x][#sep x], [/#list]'))).toEqual([
      'Unexpected parameter in Sep',
    ]);
  });

  // The implicit close must not swallow a genuinely misplaced close tag.
  it('still reports a close tag with no open', () => {
    expect(messages(parse('[#list xs as x]${x}[/#list][/#sep]'))).toEqual([
      "Unexpected close tag 'Sep'",
    ]);
  });

  it('does not implicitly close anything other than #sep', () => {
    expect(messages(parse('[#list xs as x][#if a]${x}[/#list]'))).toEqual([
      "Unexpected close tag 'List'",
      "Unclosed tag 'Condition'",
    ]);
  });
});

describe('#continue and #sep together', () => {
  it('parses a realistic list body', () => {
    const ast = parse('[#list xs as x][#if !x][#continue][/#if]${x}[#sep], [/#list]');
    expect(messages(ast)).toEqual([]);
    expect(types(ast.body)).toEqual([
      NodeTypes.List, NodeTypes.Condition, NodeTypes.Continue,
      NodeTypes.Interpolation, NodeTypes.Sep, NodeTypes.Text,
    ]);
  });
});
