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
