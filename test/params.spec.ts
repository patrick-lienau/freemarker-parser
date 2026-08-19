import { Operators } from '../src/enum/Operators';
import { ParamNames } from '../src/enum/ParamNames';
import { ParamsParser } from '../src/ParamsParser';
import { AllParamTypes } from '../src/interface/Params';

function parse(template: string): AllParamTypes {
  const parser = new ParamsParser(template);
  return parser.parseExpressions();
}

describe('params parser', () => {
  it('BinaryExpression', () => {
    const result = parse('a + 1');
    const expected = {
      type: ParamNames.BinaryExpression,
      operator: Operators.PLUS,
      left: {
        type: ParamNames.Identifier,
        name: 'a',
      },
      right: {
        type: ParamNames.Literal,
        value: 1,
        raw: '1',
      },
    };
    expect(result).toEqual(expected);
  });

  it('non-literal variable', () => {
    const result = parse('foo.baz');
    const expected = {
      type: ParamNames.MemberExpression,
      computed: false,
      object: {
        type: ParamNames.Identifier,
        name: 'foo',
      },
      property: {
        type: ParamNames.Identifier,
        name: 'baz',
      },
    };
    expect(result).toEqual(expected);
  });

  it('non-literal array', () => {
    const result = parse("foo['baz']");
    const expected = {
      type: ParamNames.MemberExpression,
      computed: true,
      object: {
        type: ParamNames.Identifier,
        name: 'foo',
      },
      property: {
        type: ParamNames.Literal,
        value: 'baz',
        raw: "'baz'",
      },
    };
    expect(result).toStrictEqual(expected);
  });

  it('unary prefix', () => {
    const result = parse('++foo');
    const expected = {
      type: ParamNames.UpdateExpression,
      operator: Operators.PLUS_PLUS,
      prefix: true,
      argument: {
        type: ParamNames.Identifier,
        name: 'foo',
      },
    };
    expect(result).toStrictEqual(expected);
  });

  it('unary suffix', () => {
    const result = parse('foo++');
    const expected = {
      type: ParamNames.UpdateExpression,
      operator: Operators.PLUS_PLUS,
      prefix: false,
      argument: {
        type: ParamNames.Identifier,
        name: 'foo',
      },
    };
    expect(result).toStrictEqual(expected);
  });

  it('toUpperCase', () => {
    const result = parse('foo?toUpperCase');
    const expected = {
      type: ParamNames.BuiltInExpression,
      left: {
        type: ParamNames.Identifier,
        name: 'foo',
      },
      operator: Operators.BUILT_IN,
      right: {
        type: ParamNames.Identifier,
        name: 'toUpperCase',
      },
    };
    expect(result).toStrictEqual(expected);
  });

  it('array expression', () => {
    const result = parse('["","a"]');
    const expected = {
      type: ParamNames.ArrayExpression,
      elements: [
        {
          type: ParamNames.Literal,
          value: '',
          raw: '""',
        },
        {
          type: ParamNames.Literal,
          value: 'a',
          raw: '"a"',
        },
      ],
    };
    expect(result).toStrictEqual(expected);
  });

  it('empty object expression', () => {
    const result = parse('{}');
    const expected = {
      type: ParamNames.MapExpression,
      elements: [],
    };
    expect(result).toStrictEqual(expected);
  });

  it('object expression', () => {
    const result = parse('{"x":1,"y":2}');
    const expected = {
      type: ParamNames.MapExpression,
      elements: [
        {
          key: {
            type: ParamNames.Literal,
            value: 'x',
            raw: '"x"',
          },
          value: {
            type: ParamNames.Literal,
            value: 1,
            raw: '1',
          },
        },
        {
          key: {
            type: ParamNames.Literal,
            value: 'y',
            raw: '"y"',
          },
          value: {
            type: ParamNames.Literal,
            value: 2,
            raw: '2',
          },
        },
      ],
    };
    expect(result).toStrictEqual(expected);
  });

  it('default-value operator (binary)', () => {
    const result = parse('foo!"bar"');
    expect(result).toStrictEqual({
      type: ParamNames.BinaryExpression,
      operator: Operators.EXCLAM,
      left: { type: ParamNames.Identifier, name: 'foo' },
      right: { type: ParamNames.Literal, value: 'bar', raw: '"bar"' },
    });
  });

  it('default-value operator on a call expression', () => {
    const result = parse('avg()!"N/A"');
    expect(result).toStrictEqual({
      type: ParamNames.BinaryExpression,
      operator: Operators.EXCLAM,
      left: {
        type: ParamNames.CallExpression,
        arguments: [],
        callee: { type: ParamNames.Identifier, name: 'avg' },
      },
      right: { type: ParamNames.Literal, value: 'N/A', raw: '"N/A"' },
    });
  });

  it('default-value operator (bare / postfix)', () => {
    const result = parse('foo!');
    expect(result).toStrictEqual({
      type: ParamNames.UnaryExpression,
      operator: Operators.EXCLAM,
      prefix: false,
      argument: { type: ParamNames.Identifier, name: 'foo' },
    });
  });

  it('prefix logical-NOT is unaffected by the default operator', () => {
    const result = parse('!foo');
    expect(result).toStrictEqual({
      type: ParamNames.UnaryExpression,
      operator: Operators.EXCLAM,
      prefix: true,
      argument: { type: ParamNames.Identifier, name: 'foo' },
    });
  });

  it('not-equals still wins over the default operator (longest match)', () => {
    const result = parse('a != b');
    expect(result).toStrictEqual({
      type: ParamNames.BinaryExpression,
      operator: Operators.NOT_EQUALS,
      left: { type: ParamNames.Identifier, name: 'a' },
      right: { type: ParamNames.Identifier, name: 'b' },
    });
  });

  it('postfix ?? binds tighter than prefix logical-NOT', () => {
    // `!foo??` means `!(foo??)` — "foo is missing" — not `(!foo)??`.
    const result = parse('!foo??');
    expect(result).toStrictEqual({
      type: ParamNames.UnaryExpression,
      operator: Operators.EXCLAM,
      prefix: true,
      argument: {
        type: ParamNames.UnaryExpression,
        operator: Operators.EXISTS,
        prefix: false,
        argument: { type: ParamNames.Identifier, name: 'foo' },
      },
    });
  });

  it('postfix builtin binds tighter than prefix logical-NOT', () => {
    // `!foo?has_content` means `!(foo?has_content)`, not `(!foo)?has_content`.
    const result = parse('!foo?has_content');
    expect(result).toStrictEqual({
      type: ParamNames.UnaryExpression,
      operator: Operators.EXCLAM,
      prefix: true,
      argument: {
        type: ParamNames.BuiltInExpression,
        operator: Operators.BUILT_IN,
        left: { type: ParamNames.Identifier, name: 'foo' },
        right: { type: ParamNames.Identifier, name: 'has_content' },
      },
    });
  });

  it('postfix ?? / builtin on a non-leftmost operand of a && chain', () => {
    // Regression: only the leftmost operand used to get postfix handling, so a
    // trailing `??` on a middle operand (binary precedence 0) desynced the
    // stream and threw "Expected expression after &&".
    const result = parse('a?? && b?has_content && c');
    expect(result).toStrictEqual({
      type: ParamNames.LogicalExpression,
      operator: Operators.AND,
      left: {
        type: ParamNames.LogicalExpression,
        operator: Operators.AND,
        left: {
          type: ParamNames.UnaryExpression,
          operator: Operators.EXISTS,
          prefix: false,
          argument: { type: ParamNames.Identifier, name: 'a' },
        },
        right: {
          type: ParamNames.BuiltInExpression,
          operator: Operators.BUILT_IN,
          left: { type: ParamNames.Identifier, name: 'b' },
          right: { type: ParamNames.Identifier, name: 'has_content' },
        },
      },
      right: { type: ParamNames.Identifier, name: 'c' },
    });
  });

  it('postfix ?? on a middle operand does not desync the parser', () => {
    // `x && a?? && b` previously threw; the `??` must attach to `a`.
    const result = parse('x && a?? && b');
    expect(result).toStrictEqual({
      type: ParamNames.LogicalExpression,
      operator: Operators.AND,
      left: {
        type: ParamNames.LogicalExpression,
        operator: Operators.AND,
        left: { type: ParamNames.Identifier, name: 'x' },
        right: {
          type: ParamNames.UnaryExpression,
          operator: Operators.EXISTS,
          prefix: false,
          argument: { type: ParamNames.Identifier, name: 'a' },
        },
      },
      right: { type: ParamNames.Identifier, name: 'b' },
    });
  });

  it('special variable reference', () => {
    const result = parse('.data_model');
    expect(result).toStrictEqual({
      type: ParamNames.Identifier,
      name: '.data_model',
    });
  });

  it('special variable with member access', () => {
    const result = parse('.vars["x"]');
    expect(result).toStrictEqual({
      type: ParamNames.MemberExpression,
      computed: true,
      object: { type: ParamNames.Identifier, name: '.vars' },
      property: { type: ParamNames.Literal, value: 'x', raw: '"x"' },
    });
  });

  it('leading-dot numeric literal is still a number', () => {
    const result = parse('.5');
    expect(result).toStrictEqual({
      type: ParamNames.Literal,
      value: 0.5,
      raw: '.5',
    });
  });

  // ---------------------------------------------------------------------------
  // Range operators — `0..9`, `0..<10`, `0..!10`, `0..*10`, and the open-ended
  // `5..`. See BinaryOps in enum/Operators.ts for the precedence choice.
  // ---------------------------------------------------------------------------

  const lit = (value: number, raw: string): AllParamTypes =>
    ({ type: ParamNames.Literal, value, raw } as AllParamTypes);
  const ident = (name: string): AllParamTypes =>
    ({ type: ParamNames.Identifier, name } as AllParamTypes);

  it('numeric range', () => {
    expect(parse('1..3')).toStrictEqual({
      type: ParamNames.BinaryExpression,
      operator: Operators.DOT_DOT,
      left: lit(1, '1'),
      right: lit(3, '3'),
    });
  });

  it('identifier range', () => {
    expect(parse('start..end')).toStrictEqual({
      type: ParamNames.BinaryExpression,
      operator: Operators.DOT_DOT,
      left: ident('start'),
      right: ident('end'),
    });
  });

  it.each([
    [Operators.DOT_DOT_LESS, '0..<10'],
    [Operators.DOT_DOT_NOT, '0..!10'],
    [Operators.DOT_DOT_ASTERISK, '0..*10'],
  ])('range variant %s', (operator, source) => {
    expect(parse(source)).toStrictEqual({
      type: ParamNames.BinaryExpression,
      operator,
      left: lit(0, '0'),
      right: lit(10, '10'),
    });
  });

  it('binds looser than arithmetic (`0..n-1` is `0..(n-1)`)', () => {
    expect(parse('0..n-1')).toStrictEqual({
      type: ParamNames.BinaryExpression,
      operator: Operators.DOT_DOT,
      left: lit(0, '0'),
      right: {
        type: ParamNames.BinaryExpression,
        operator: Operators.MINUS,
        left: ident('n'),
        right: lit(1, '1'),
      },
    });
  });

  it('binds tighter than comparison (`x..y > z` is `(x..y) > z`)', () => {
    expect(parse('x..y > z')).toStrictEqual({
      type: ParamNames.BinaryExpression,
      operator: Operators.NATURAL_GT,
      left: {
        type: ParamNames.BinaryExpression,
        operator: Operators.DOT_DOT,
        left: ident('x'),
        right: ident('y'),
      },
      right: ident('z'),
    });
  });

  it('range over a member expression', () => {
    expect(parse('0..configuration.count-1')).toStrictEqual({
      type: ParamNames.BinaryExpression,
      operator: Operators.DOT_DOT,
      left: lit(0, '0'),
      right: {
        type: ParamNames.BinaryExpression,
        operator: Operators.MINUS,
        left: {
          type: ParamNames.MemberExpression,
          computed: false,
          object: ident('configuration'),
          property: ident('count'),
        },
        right: lit(1, '1'),
      },
    });
  });

  it('range as a sequence slice', () => {
    expect(parse('items[0..2]')).toStrictEqual({
      type: ParamNames.MemberExpression,
      computed: true,
      object: ident('items'),
      property: {
        type: ParamNames.BinaryExpression,
        operator: Operators.DOT_DOT,
        left: lit(0, '0'),
        right: lit(2, '2'),
      },
    });
  });

  it('open-ended range is a postfix unary', () => {
    expect(parse('seq[5..]')).toStrictEqual({
      type: ParamNames.MemberExpression,
      computed: true,
      object: ident('seq'),
      property: {
        type: ParamNames.UnaryExpression,
        operator: Operators.DOT_DOT,
        argument: lit(5, '5'),
        prefix: false,
      },
    });
  });

  it('decimal literals still parse next to a range', () => {
    expect(parse('1.5..2.5')).toStrictEqual({
      type: ParamNames.BinaryExpression,
      operator: Operators.DOT_DOT,
      left: lit(1.5, '1.5'),
      right: lit(2.5, '2.5'),
    });
  });

  it('a second decimal marker is still an error', () => {
    expect(() => parse('1.2.3')).toThrow('Unexpected period');
  });

  it('member access is unaffected by the range fix', () => {
    expect(parse('a.b')).toStrictEqual({
      type: ParamNames.MemberExpression,
      computed: false,
      object: ident('a'),
      property: ident('b'),
    });
  });

  it('to string', () => {
    const result = parse('foo?string("yes")');
    const expected = {
      type: ParamNames.BuiltInExpression,
      left: {
        type: ParamNames.Identifier,
        name: 'foo',
      },
      operator: Operators.BUILT_IN,
      right: {
        type: ParamNames.CallExpression,
        arguments: [
          {
            type: ParamNames.Literal,
            raw: '"yes"',
            value: 'yes',
          },
        ],
        callee: {
          name: 'string',
          type: ParamNames.Identifier,
        },
      },
    };
    expect(result).toStrictEqual(expected);
  });
});
