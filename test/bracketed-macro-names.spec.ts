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

function firstMacroName(ast: ProgramNode): string {
  return (ast.body[0] as unknown as { name: string }).name;
}

// `<@liferay_util["html-top"]>` is the standard way Liferay taglib macros are
// called. parseTagName() accepted only letters, `.` and `_`, so it threw
// `Invalid \`[\`` — and because that throw escapes the tokenizer rather than
// being recovered per-token, the ENTIRE file was lost: zero nodes, every lint
// rule silently skipped.
describe('bracketed macro names', () => {
  it.each([
    ['[@liferay_util["html-top"]]x[/@liferay_util["html-top"]]'],
    ['<@liferay_util["html-top"]>x</@liferay_util["html-top"]>'],
  ])('parses a taglib call: %s', (source) => {
    const ast = parse(source);
    expect(messages(ast)).toEqual([]);
    expect(ast.body[0].type).toBe(NodeTypes.MacroCall);
    expect(firstMacroName(ast)).toBe('liferay_util["html-top"]');
  });

  it('parses a self-closing taglib call with params', () => {
    const ast = parse('[@liferay_ui["message"] key="x" /]');
    expect(messages(ast)).toEqual([]);
    expect(firstMacroName(ast)).toBe('liferay_ui["message"]');
  });

  it('parses chained lookups', () => {
    const ast = parse('[@ns["a"]["b"]]x[/@ns["a"]["b"]]');
    expect(messages(ast)).toEqual([]);
    expect(firstMacroName(ast)).toBe('ns["a"]["b"]');
  });

  it('tolerates a `]` inside the quoted key', () => {
    const ast = parse('[@ns["a]b"]]x[/@ns["a]b"]]');
    expect(messages(ast)).toEqual([]);
    expect(firstMacroName(ast)).toBe('ns["a]b"]');
  });

  it('leaves a plain macro name alone', () => {
    const ast = parse('[@isaButton label="x" /]');
    expect(messages(ast)).toEqual([]);
    expect(firstMacroName(ast)).toBe('isaButton');
  });

  it('reports an unclosed bracket rather than running to EOF', () => {
    expect(messages(parse('[@liferay_util["html-top"'))).toEqual([
      'Unclosed [ in tag name',
    ]);
  });

  // `</@>` is FreeMarker's shorthand close for a macro call. The tokenizer
  // required a name and threw, which — like `Invalid \`[\`` — escaped
  // tokenization and cost the whole file. The parser matches a close macro on
  // node type, never on the name, so the name was never needed.
  it.each([
    ['[@isaButton]x[/@]'],
    ['<@isaButton>x</@>'],
    ['[@liferay_util["html-top"]]x[/@]'],
  ])('accepts the shorthand macro close: %s', (source) => {
    const ast = parse(source);
    expect(messages(ast)).toEqual([]);
    expect(ast.body[0].type).toBe(NodeTypes.MacroCall);
  });

  it('still requires a name on a close directive', () => {
    expect(messages(parse('[#if a]x[/#]'))).toEqual([
      'CloseDirective name cannot be empty',
    ]);
  });
});
