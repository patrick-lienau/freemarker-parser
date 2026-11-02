import { NodeTypes } from '../src/enum/NodeTypes';
import { Parser } from '../src';
import AbstractNode from '../src/nodes/abstract/AbstractNode';
import ProgramNode from '../src/nodes/ProgramNode';
import { Tokenizer } from '../src/Tokenizer';

function parse(template: string): ProgramNode {
  const squareTags = template.trimStart().startsWith('[');
  return new Parser().parse(template, { squareTags, parseLocation: true }).ast;
}

function messages(ast: ProgramNode): string[] {
  return (ast.errors ?? []).map((e) => e.message);
}

function paramTexts(template: string): (string | undefined)[] {
  const squareTags = template.trimStart().startsWith('[');
  return new Tokenizer({ squareTags }).parse(template).map((t) => t.params);
}

function bodyOf(node: AbstractNode): AbstractNode[] {
  return ((node as unknown) as { body: AbstractNode[] }).body;
}

// The tokenizer ignored `\` when tracking quotes, so `"src=\"…\""` closed at the
// first `\"`, the quotes after it fell out of step, and it threw `Missing "
// close char`. A tokenizer throw is not recovered per token: the whole file
// parsed to an empty AST.
describe('escaped quotes in directive params', () => {
  it.each([
    ['<#assign m = s?matches("src=\\"([^\\"]+)\\"") />'],
    ['[#assign m = s?matches("src=\\"([^\\"]+)\\"")]'],
    ["<#assign m = s?replace('it\\'s', 'x')>"],
    ["[#assign m = s?replace('it\\'s', 'x')]"],
  ])('keeps the assignment: %s', (source) => {
    const ast = parse(source);
    expect(messages(ast)).toEqual([]);
    expect(ast.body.map((n) => n.type)).toEqual([NodeTypes.Assign]);
  });

  it.each([
    ['<#assign m = s?matches("a\\"b>c")>x', 'm = s?matches("a\\"b>c")'],
    ['[#assign m = s?matches("a\\"b]c")]x', 'm = s?matches("a\\"b]c")'],
    ['${"a\\"}"}x', '"a\\"}"'],
  ])(
    'does not end the tag at a terminator inside the string: %s',
    (source, params) => {
      expect(paramTexts(source)[0]).toBe(params);
    },
  );

  it.each([
    ['<#assign p = s?replace("\\\\", "/")>x'],
    ['[#assign p = s?replace("\\\\", "/")]x'],
  ])('closes a string that ends in an escaped backslash: %s', (source) => {
    const ast = parse(source);
    expect(messages(ast)).toEqual([]);
    expect(ast.body.map((n) => n.type)).toEqual([
      NodeTypes.Assign,
      NodeTypes.Text,
    ]);
  });

  it.each([
    ['<#assign p = r"C:\\dir\\">x', 'p = r"C:\\dir\\"'],
    ['[#assign p = r"C:\\dir\\"]x', 'p = r"C:\\dir\\"'],
    ["<#assign p = r'\\'>x", "p = r'\\'"],
  ])('leaves a raw string without escapes: %s', (source, params) => {
    expect(paramTexts(source)[0]).toBe(params);
  });

  it.each([
    [
      '<#function f s><#local m = s?matches("<iframe\\\\s[^>]*?src=\\"([^\\"]+)\\".*")><#return m></#function>',
    ],
    [
      '[#function f s][#local m = s?matches("<iframe\\\\s[^>]*?src=\\"([^\\"]+)\\".*")][#return m][/#function]',
    ],
  ])('keeps the function body around it: %s', (source) => {
    const ast = parse(source);
    expect(messages(ast)).toEqual([]);
    expect(ast.body.map((n) => n.type)).toEqual([NodeTypes.Function]);
    expect(bodyOf(ast.body[0]).map((n) => n.type)).toEqual([
      NodeTypes.Local,
      NodeTypes.Return,
    ]);
  });
});
