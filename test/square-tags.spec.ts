import { Parser } from '../src';

function parse(src: string) {
  const { ast } = new Parser().parse(src, { squareTags: true });
  return ast;
}
const types = (ast: any): string[] => {
  const out: string[] = [];
  const walk = (n: any) => {
    if (!n || typeof n !== 'object') return;
    if (typeof n.type === 'string' && typeof n.start === 'number') out.push(n.type);
    for (const v of Object.values(n)) {
      if (Array.isArray(v)) v.forEach(walk);
    }
  };
  ast.body?.forEach(walk);
  return out;
};

describe('square-bracket tag syntax', () => {
  it('parses a container #if', () => {
    const ast = parse('[#if x]a[/#if]');
    expect(ast.errors).toBeFalsy();
    expect(types(ast)).toContain('Condition');
  });
  it('parses #list with an "as" clause', () => {
    const ast = parse('[#list xs as x]${x}[/#list]');
    expect(ast.errors).toBeFalsy();
    expect(types(ast)).toEqual(expect.arrayContaining(['List', 'Interpolation']));
  });
  it('handles bracket index/array expressions in params without ending the tag early', () => {
    const ast = parse('[#assign a = xs[0] /][#if a[0] gt 1]y[/#if]');
    expect(ast.errors).toBeFalsy();
    expect(types(ast)).toEqual(expect.arrayContaining(['Assign', 'Condition']));
  });
});
