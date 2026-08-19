import AbstractTokenizer from './AbstractTokenizer';
import ECharCodes from './enum/CharCodes';
import {
  BinaryOps,
  Literals,
  Operators,
  UnaryOps,
  isRangeOp,
  maxBinaryOps,
  maxUnaryOps,
} from './enum/Operators';
import { ParamNames } from './enum/ParamNames';
import ParseError from './errors/ParseError';
import {
  AllParamTypes,
  ArrayExpression,
  AssignmentExpression,
  BinaryExpression,
  BuiltInExpression,
  CallExpression,
  Identifier,
  Literal,
  LogicalExpression,
  MapExpression,
  MapExpressionValues,
  MemberExpression,
  UnaryExpression,
  UpdateExpression,
} from './interface/Params';
import {
  isDecimalDigit,
  isIdentifierPart,
  isIdentifierStart,
  isWhitespace,
} from './utils/Chars';

// Specify values directly
// - Strings: "Foo" or 'Foo' or "It's \"quoted\"" or 'It\'s "quoted"' or r"C:\raw\string"
// - Numbers: 123.45
// - Booleans: true, false
// - Sequences: ["foo", "bar", 123.45];Ranges: 0..9, 0..<10 (or 0..!10), 0..
// - Hashes: {"name":"green mouse", "price":150}
// Retrieving variables
// - Top-level variables: user
// - Retrieving data from a hash: user.name, user["name"]
// - Retrieving data from a sequence: products[5]
// - Special variable: .main
// String operations
// - Interpolation and concatenation: "Hello ${user}!" (or "Hello " + user + "!")
// - Getting a character: name[0]
// - String slice: Inclusive end: name[0..4], Exclusive end: name[0..<5], Length-based (lenient): name[0..*5], Remove starting: name[5..]
// Sequence operations
// - Concatenation: users + ["guest"]
// - Sequence slice: Inclusive end: products[20..29], Exclusive end: products[20..<30], Length-based (lenient): products[20..*10], Remove starting: products[20..]
// Hash operations
// - Concatenation: passwords + { "joe": "secret42" }
// - Arithmetical calculations: (x * 1.5 + 10) / 2 - y % 100
// - Comparison: x == y, x != y, x < y, x > y, x >= y, x <= y, x lt y, x lte y, x gt y, x gte y, ...etc.
// - Logical operations: !registered && (firstVisit || fromEurope)
// - Built-ins: name?upper_case, path?ensure_starts_with('/')
// - Method call: repeat("What", 3)
// Missing value handler operators:
// - Default value: name!"unknown" or (user.name)!"unknown" or name! or (user.name)!
// - Missing value test: name?? or (user.name)??
// - Assignment operators: =, +=, -=, *=, /=, %=, ++, --

interface BiopInfo {
  value: Operators;
  prec: number;
}

function isIBiopInfo(
  object: AllParamTypes | BiopInfo | undefined,
): object is BiopInfo {
  return !!object && 'prec' in object;
}

function isAllParamTypes(
  object: AllParamTypes | BiopInfo | undefined,
): object is AllParamTypes {
  return !!object && 'type' in object;
}

/**
 * Returns the precedence of a binary operator or `0` if it isn't a binary operator
 * @param opVal
 */
function binaryPrecedence(opVal: Operators): number {
  return BinaryOps[opVal] || 0;
}

function createAssignmentExpression(
  operator: string,
  left: AllParamTypes,
  right: AllParamTypes,
): AssignmentExpression {
  return { type: ParamNames.AssignmentExpression, operator, left, right };
}

function createBuiltInExpression(
  operator: string,
  left: AllParamTypes,
  right: AllParamTypes,
): BuiltInExpression {
  return { type: ParamNames.BuiltInExpression, operator, left, right };
}

function createUpdateExpression(
  operator: string,
  argument: AllParamTypes,
  prefix = true,
): UpdateExpression {
  return { type: ParamNames.UpdateExpression, operator, argument, prefix };
}

/**
 * Utility function (gets called from multiple places)
 * Also note that `a && b` and `a || b` are *logical* expressions, not binary expressions
 */
function createBinaryExpression(
  operator: Operators,
  left: AllParamTypes,
  right: AllParamTypes,
):
  | BinaryExpression
  | LogicalExpression
  | AssignmentExpression
  | BuiltInExpression {
  switch (operator) {
    case Operators.EQUALS:
    case Operators.PLUS_EQUALS:
    case Operators.MINUS_EQUALS:
    case Operators.TIMES_EQUALS:
    case Operators.DIV_EQUALS:
    case Operators.MOD_EQUALS:
      return createAssignmentExpression(operator, left, right);
    case Operators.BUILT_IN:
      return createBuiltInExpression(operator, left, right);
    case Operators.OR:
    case Operators.AND:
      return { type: ParamNames.LogicalExpression, operator, left, right };
    default:
      return { type: ParamNames.BinaryExpression, operator, left, right };
  }
}

function createUnaryExpression(
  operator: string,
  argument: AllParamTypes | null,
  prefix = true,
): UnaryExpression | UpdateExpression {
  if (!argument) {
    throw new ParseError(
      `Missing argument in ${prefix ? 'before' : 'after'} '${operator}'`,
      { start: 0, end: 0 },
    );
  }
  switch (operator) {
    case Operators.PLUS_PLUS:
    case Operators.MINUS_MINUS:
      return createUpdateExpression(operator, argument, prefix);
    default:
      return { type: ParamNames.UnaryExpression, operator, argument, prefix };
  }
}

export class ParamsParser extends AbstractTokenizer {
  constructor(template: string) {
    super();
    super.init(template);
  }

  public parseExpressions(): AllParamTypes {
    let node;
    const nodes = [];

    while (this.index < this.length) {
      // Try to gobble each expression individually
      node = this.parseExpression();
      if (node) {
        // If we weren't able to find a binary expression and are out of room, then
        // the expression passed in probably has too much
        nodes.push(node);

        if (this.charCodeAt(this.index) === ECharCodes.Comma) {
          ++this.index;
        }
      } else if (this.index < this.length) {
        throw new ParseError(`Unexpected "${this.charAt(this.index)}"`, {
          start: this.index,
          end: this.index,
        });
      }
    }

    // If there's only one expression just try returning the expression
    if (nodes.length === 1) {
      return nodes[0];
    } else {
      return {
        type: ParamNames.Compound,
        body: nodes,
      };
    }
  }

  /**
   * The main parsing function. Much of this code is dedicated to ternary expressions
   */
  protected parseExpression(): AllParamTypes | null {
    const test = this.parseBinaryExpression();
    this.parseSpaces();
    return test;
  }

  /**
   * Push `index` up to the next non-space character
   */
  protected parseSpaces(): void {
    let ch = this.charCodeAt(this.index);
    // space or tab
    while (isWhitespace(ch)) {
      ch = this.charCodeAt(++this.index);
    }
  }

  /**
   * Search for the operation portion of the string (e.g. `+`, `===`)
   * Start by taking the longest possible binary operations (3 characters: `===`, `!==`, `>>>`)
   * and move down from 3 to 2 to 1 character until a matching binary operation is found
   * then, return that binary operation
   */
  protected parseBinaryOp(): Operators | null {
    this.parseSpaces();
    let toCheck = this.template.substr(this.index, maxBinaryOps);
    let tcLen = toCheck.length;
    while (tcLen > 0) {
      if (toCheck in BinaryOps) {
        this.index += tcLen;
        return toCheck as Operators;
      }
      toCheck = toCheck.substr(0, --tcLen);
    }
    return null;
  }

  /**
   * Parse a primary token plus any postfix operators that bind TIGHTER than a
   * prefix unary operator: builtins (`?upper_case`), the exists test (`??`),
   * and the bare/binary default operator (`!` / `!default`). Used only for the
   * operand of a prefix unary so that `!x??` parses as `!(x??)` and
   * `!x?has_content` as `!(x?has_content)`, matching FreeMarker precedence
   * (postfix `?`/`??` outrank prefix `!`).
   */
  protected parsePostfixChain(): AllParamTypes | null {
    let node = this.parseToken();
    if (!node) {
      return node;
    }
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const save = this.index;
      const op = this.parseBinaryOp();
      if (op === Operators.BUILT_IN) {
        const name = this.parseToken();
        if (!name) {
          this.index = save;
          break;
        }
        node = createBinaryExpression(op, node, name);
      } else if (op === Operators.EXISTS) {
        node = createUnaryExpression(op, node, false);
      } else if (op === Operators.EXCLAM) {
        const def = this.parseToken();
        node = def
          ? createBinaryExpression(op, node, def)
          : createUnaryExpression(op, node, false);
      } else {
        // Not a tighter-than-prefix postfix operator — restore and stop.
        this.index = save;
        break;
      }
    }
    return node;
  }

  /**
   * An open-ended range (`seq[5..]`, `text[3..]`) — the range operators are the
   * only binary operators FreeMarker lets you write with no right operand, so
   * the precedence stack cannot represent them. Attach one to its left operand
   * as a postfix unary instead.
   *
   * Call with `this.index` just past the operator. Returns the postfix node when
   * nothing follows the operator, or `null` with the index restored when
   * something does — leaving the caller to treat it as an ordinary binary op.
   */
  protected tryOpenEndedRange(
    op: Operators,
    node: AllParamTypes | null,
  ): AllParamTypes | null {
    if (!node) {
      return null;
    }
    const afterOp = this.index;
    let operand: AllParamTypes | null = null;
    try {
      operand = this.parseToken();
    } catch {
      // Whatever follows is not a token we can read; let the ordinary binary
      // path run and report the real error rather than silently swallowing it.
      operand = null;
      this.index = afterOp;
      return null;
    }
    this.index = afterOp;
    return operand ? null : createUnaryExpression(op, node, false);
  }

  /**
   * Consume the precedence-0 postfix operators that can trail ANY operand of a
   * binary expression — the exists test (`x??`), the bare/binary default
   * operator (`x!` / `x!def`), and postfix update (`x++` / `x--`). These have no
   * usable binary precedence, so the precedence stack cannot place them; they
   * must be attached to their operand as it is read (at any position in the
   * chain, not just the leftmost). `?builtin` is intentionally excluded — it has
   * real binary precedence and is left-associated by the stack.
   */
  protected consumePostfixUnaries(
    node: AllParamTypes | null,
  ): AllParamTypes | null {
    if (!node) {
      return node;
    }
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const save = this.index;
      const op = this.parseBinaryOp();
      if (
        op === Operators.PLUS_PLUS ||
        op === Operators.MINUS_MINUS ||
        op === Operators.EXISTS
      ) {
        node = createUnaryExpression(op, node, false);
      } else if (op === Operators.EXCLAM) {
        const defSave = this.index;
        const def = this.parseToken();
        if (def) {
          node = createBinaryExpression(op, node, def);
        } else {
          this.index = defSave;
          node = createUnaryExpression(op, node, false);
        }
      } else if (isRangeOp(op)) {
        const open = this.tryOpenEndedRange(op as Operators, node);
        if (!open) {
          // A closed range — it has real precedence, so restore and let the
          // caller's stack place it.
          this.index = save;
          break;
        }
        node = open;
      } else {
        // Not a precedence-0 postfix operator — restore and let the caller's
        // binary-precedence stack handle it (`?builtin`, `+`, `&&`, …).
        this.index = save;
        break;
      }
    }
    return node;
  }

  /**
   * This function is responsible for gobbling an individual expression,
   * e.g. `1`, `1+2`, `a+(b*2)-Math.sqrt(2)`
   */
  protected parseBinaryExpression(): AllParamTypes | null {
    let node;
    let biop: Operators | null;
    let prec;
    let biopInfo;
    let fbiop;
    let left;
    let right;
    let i;

    // First, try to get the leftmost thing
    // Then, get the operator following the leftmost thing
    left = this.parseToken();
    biop = this.parseBinaryOp();

    // Handle postfix operators before the precedence stack:
    //   `foo++` / `foo--`  -> postfix update
    //   `foo??`            -> exists test (postfix)
    //   `foo!` / `foo!def` -> default-value operator. Bare (`foo!`) is a
    //                         postfix unary; with a right operand (`foo!def`)
    //                         it is a binary expression. Prefix logical-NOT
    //                         (`!foo`) is consumed earlier by parseToken(), so
    //                         any `!` seen here is always the default operator.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (biop === Operators.EXCLAM) {
        const save = this.index;
        const def = this.parseToken();
        if (def) {
          left = createBinaryExpression(biop, left as AllParamTypes, def);
        } else {
          this.index = save;
          left = createUnaryExpression(biop, left, false);
        }
      } else if (
        biop === Operators.PLUS_PLUS ||
        biop === Operators.MINUS_MINUS ||
        biop === Operators.EXISTS
      ) {
        left = createUnaryExpression(biop, left, false);
      } else if (isRangeOp(biop)) {
        // `seq[5..]` — postfix here; a closed range falls through to the stack.
        const open = this.tryOpenEndedRange(biop as Operators, left);
        if (!open) {
          break;
        }
        left = open;
      } else {
        break;
      }
      biop = this.parseBinaryOp();
    }

    // If there wasn't a binary operator, just return the leftmost node
    if (!biop) {
      return left;
    }

    // Otherwise, we need to start a stack to properly place the binary operations in their
    // precedence structure
    biopInfo = {
      value: biop,
      prec: binaryPrecedence(biop),
    };

    // Operands other than the leftmost still carry their own precedence-0
    // postfix operators (`b??`, `b!`, `b!def`). Consume them here — plain
    // parseToken() would leave a trailing `??`, whose binary precedence is 0, to
    // desync the stream (`x && a?? && b` → "Expected expression after &&").
    // `?builtin` is deliberately NOT consumed here: it has real binary
    // precedence and must flow through the stack below to stay left-associative
    // (`a?b?c` = `(a?b)?c`, not `a?(b?c)`).
    right = this.consumePostfixUnaries(this.parseToken());
    if (!right || !left) {
      throw new ParseError(`Expected expression after ${biop}`, {
        start: this.index,
        end: this.index,
      });
    }
    const stack: Array<AllParamTypes | BiopInfo> = [left, biopInfo, right];

    /**
     * Properly deal with precedence using
     * @see http://www.engr.mun.ca/~theo/Misc/exp_parsing.htm
     */
    // eslint-disable-next-line no-constant-condition
    while (true) {
      biop = this.parseBinaryOp();
      if (!biop) {
        break;
      }

      prec = binaryPrecedence(biop);

      if (prec === 0) {
        break;
      }
      biopInfo = { value: biop, prec };

      // Reduce: make a binary expression from the three topmost entries.
      while (stack.length > 2) {
        fbiop = stack[stack.length - 2];
        if (!isIBiopInfo(fbiop) || prec > fbiop.prec) {
          break;
        }
        right = stack.pop();
        stack.pop();
        left = stack.pop();
        if (!isAllParamTypes(right) || !isAllParamTypes(left)) {
          break;
        }
        node = createBinaryExpression(fbiop.value, left, right);
        stack.push(node);
      }

      node = this.consumePostfixUnaries(this.parseToken());
      if (!node) {
        throw new ParseError(`Expected expression after ${biop}`, {
          start: this.index,
          end: this.index,
        });
      }
      stack.push(biopInfo, node);
    }

    i = stack.length - 1;
    node = stack[i];
    while (i > 1) {
      fbiop = stack[i - 1];
      left = stack[i - 2];
      if (
        !isIBiopInfo(fbiop) ||
        !isAllParamTypes(left) ||
        !isAllParamTypes(node)
      ) {
        throw new ParseError(`Expected expression`, {
          start: this.index,
          end: this.index,
        });
      }
      node = createBinaryExpression(fbiop.value, left, node);
      i -= 2;
    }
    if (!isAllParamTypes(node)) {
      throw new ParseError(`Expected expression`, {
        start: this.index,
        end: this.index,
      });
    }
    return node;
  }

  /**
   * An individual part of a binary expression:
   * e.g. `foo.bar(baz)`, `1`, `"abc"`, `(a % 2)` (because it's in parenthesis)
   */
  protected parseToken(): AllParamTypes | null {
    this.parseSpaces();
    const ch = this.charCodeAt(this.index);

    if (isDecimalDigit(ch)) {
      return this.parseNumericLiteral();
    } else if (ch === ECharCodes.Period) {
      // A dot can start a numeric literal (`.5`) or a special-variable
      // reference (`.now`, `.vars`, `.data_model`, `.lang`, …).
      if (isDecimalDigit(this.charCodeAt(this.index + 1))) {
        return this.parseNumericLiteral();
      }
      return this.parseVariable();
    } else if (ch === ECharCodes.SingleQuote || ch === ECharCodes.DoubleQuote) {
      // Single or double quotes
      return this.parseStringLiteral();
    } else if (isIdentifierStart(ch) || ch === ECharCodes.OpenParenthesis) {
      // open parenthesis
      // `foo`, `bar.baz`
      return this.parseVariable();
    } else if (ch === ECharCodes.OpenBracket) {
      return this.parseArray();
    } else if (ch === ECharCodes.OpenBrace) {
      return this.parseMap();
    } else {
      let toCheck = this.template.substr(this.index, maxUnaryOps);
      let tcLen = toCheck.length;
      while (tcLen > 0) {
        if (toCheck in UnaryOps) {
          this.index += tcLen;
          // The operand gobbles its own postfix `?`/`??`/`!` chain first, so a
          // prefix unary (`!x??`) binds looser than those postfix operators.
          return createUnaryExpression(toCheck, this.parsePostfixChain(), true);
        }
        toCheck = toCheck.substr(0, --tcLen);
      }
    }
    return null;
  }

  /**
   * Parse simple numeric literals: `12`, `3.4`, `.5`. Do this by using a string to
   * keep track of everything in the numeric literal and then calling `parseFloat` on that string
   */
  protected parseNumericLiteral(): Literal {
    let rawName = '';
    while (isDecimalDigit(this.charCodeAt(this.index))) {
      rawName += this.charAt(this.index++);
    }

    // A single `.` is a decimal marker; a doubled one starts the range operator
    // (`1..3`) and belongs to the expression, not to this literal.
    if (
      this.charCodeAt(this.index) === ECharCodes.Period &&
      this.charCodeAt(this.index + 1) !== ECharCodes.Period
    ) {
      rawName += this.charAt(this.index++);

      while (isDecimalDigit(this.charCodeAt(this.index))) {
        rawName += this.charAt(this.index++);
      }
    }

    const chCode = this.charCodeAt(this.index);
    // Check to make sure this isn't a variable name that start with a number (123abc)
    if (isIdentifierStart(chCode)) {
      throw new ParseError(
        `Variable names cannot start with a number (${rawName}${this.charAt(
          this.index,
        )})`,
        { start: this.index, end: this.index },
      );
    } else if (
      chCode === ECharCodes.Period &&
      this.charCodeAt(this.index + 1) !== ECharCodes.Period
    ) {
      // A second decimal marker (`1.2.3`) is malformed; `1..3` / `1.2..5` is a
      // range and its operator is left for parseBinaryOp().
      throw new ParseError('Unexpected period', {
        start: this.index,
        end: this.index,
      });
    }

    return {
      type: ParamNames.Literal,
      value: parseFloat(rawName),
      raw: rawName,
    };
  }

  /**
   * Parses a string literal, staring with single or double quotes with basic support for escape codes
   * e.g. `"hello world"`, `'this is\nJSEP'`
   */
  protected parseStringLiteral(): Literal {
    let str = '';
    const quote = this.charAt(this.index++);
    let closed = false;
    let ch;

    while (this.index < this.length) {
      ch = this.charAt(this.index++);
      if (ch === quote) {
        closed = true;
        break;
      } else if (ch === '\\') {
        // Check for all of the common escape codes
        ch = this.charAt(this.index++);
        str += `\\${ch}`;
      } else {
        str += ch;
      }
    }

    if (!closed) {
      throw new ParseError(`Unclosed quote after "${str}"`, {
        start: this.index,
        end: this.index,
      });
    }

    return {
      type: ParamNames.Literal,
      value: str,
      raw: quote + str + quote,
    };
  }

  /**
   * Gobbles only identifiers
   * e.g.: `foo`, `_value`, `$x1`
   * Also, this function checks if that identifier is a literal:
   * (e.g. `true`, `false`, `null`) or `this`
   */
  protected parseIdentifier(): Identifier | Literal {
    const start = this.index;

    // Special-variable reference: a leading dot (`.now`, `.data_model`, …).
    // The member-access loop in parseVariable() consumes its own `.` before
    // calling us, so a leading dot only appears here for a special variable.
    if (this.charCodeAt(this.index) === ECharCodes.Period) {
      this.index++;
    }

    let ch = this.charCodeAt(this.index);

    if (isIdentifierStart(ch)) {
      this.index++;
    } else {
      throw new ParseError(`Unexpected ${this.charAt(this.index)}`, {
        start: this.index,
        end: this.index,
      });
    }

    while (this.index < this.length) {
      ch = this.charCodeAt(this.index);
      if (isIdentifierPart(ch)) {
        this.index++;
      } else {
        break;
      }
    }
    const identifier = this.template.slice(start, this.index);

    if (identifier in Literals) {
      return {
        type: ParamNames.Literal,
        value: Literals[identifier],
        raw: identifier,
      };
    } else {
      return {
        type: ParamNames.Identifier,
        name: identifier,
      };
    }
  }

  /**
   * Gobbles a list of arguments within the context of a function call
   * or array literal. This function also assumes that the opening character
   * `(` or `[` has already been gobbled, and gobbles expressions and commas
   * until the terminator character `)` or `]` is encountered.
   * e.g. `foo(bar, baz)`, `my_func()`, or `[bar, baz]`
   */
  protected parseArguments(termination: number): AllParamTypes[] {
    let chI: number;
    const args: AllParamTypes[] = [];
    let node;
    let closed = false;
    while (this.index < this.length) {
      this.parseSpaces();
      chI = this.charCodeAt(this.index);
      if (chI === termination) {
        // done parsing
        closed = true;
        this.index++;
        break;
      } else if (chI === ECharCodes.Comma) {
        // between expressions
        this.index++;
      } else {
        node = this.parseExpression();
        if (!node || node.type === ParamNames.Compound) {
          throw new ParseError('Expected comma', {
            start: this.index,
            end: this.index,
          });
        }
        args.push(node);
      }
    }
    if (!closed) {
      throw new ParseError(`Expected ${String.fromCharCode(termination)}`, {
        start: this.index,
        end: this.index,
      });
    }
    return args;
  }

  /**
   * Gobble a non-literal variable name. This variable name may include properties
   * e.g. `foo`, `bar.baz`, `foo['bar'].baz`
   * It also gobbles function calls:
   * e.g. `Math.acos(obj.angle)`
   */
  protected parseVariable(): AllParamTypes | null {
    let chI: number;
    chI = this.charCodeAt(this.index);
    let node: AllParamTypes | null =
      chI === ECharCodes.OpenParenthesis
        ? this.parseGroup()
        : this.parseIdentifier();

    this.parseSpaces();
    chI = this.charCodeAt(this.index);
    while (
      chI === ECharCodes.Period ||
      chI === ECharCodes.OpenBracket ||
      chI === ECharCodes.OpenParenthesis
    ) {
      // `start..end` is the range operator, not a member access on `start`.
      // Leave it for parseBinaryOp().
      if (
        chI === ECharCodes.Period &&
        this.charCodeAt(this.index + 1) === ECharCodes.Period
      ) {
        break;
      }
      this.index++;
      if (chI === ECharCodes.Period) {
        this.parseSpaces();
        node = {
          type: ParamNames.MemberExpression,
          computed: false,
          object: node,
          property: this.parseIdentifier(),
        } as MemberExpression;
      } else if (chI === ECharCodes.OpenBracket) {
        node = {
          type: ParamNames.MemberExpression,
          computed: true,
          object: node,
          property: this.parseExpression(),
        } as MemberExpression;
        this.parseSpaces();
        chI = this.charCodeAt(this.index);
        if (chI !== ECharCodes.CloseBracket) {
          throw new ParseError('Unclosed [', {
            start: this.index,
            end: this.index,
          });
        }
        this.index++;
      } else if (chI === ECharCodes.OpenParenthesis) {
        // A function call is being made; gobble all the arguments
        node = {
          type: ParamNames.CallExpression,
          arguments: this.parseArguments(ECharCodes.CloseParenthesis),
          callee: node,
        } as CallExpression;
      }
      this.parseSpaces();
      chI = this.charCodeAt(this.index);
    }
    return node;
  }

  /**
   * Responsible for parsing a group of things within parentheses `()`
   * This function assumes that it needs to gobble the opening parenthesis
   * and then tries to gobble everything within that parenthesis, assuming
   * that the next thing it should see is the close parenthesis. If not,
   * then the expression probably doesn't have a `)`
   */
  protected parseGroup(): AllParamTypes | null {
    this.index++;
    const node = this.parseExpression();
    this.parseSpaces();
    if (this.charCodeAt(this.index) === ECharCodes.CloseParenthesis) {
      this.index++;
      return node;
    } else {
      throw new ParseError('Unclosed (', {
        start: this.index,
        end: this.index,
      });
    }
  }

  /**
   * Responsible for parsing Array literals `[1, 2, 3]`
   * This function assumes that it needs to gobble the opening bracket
   * and then tries to gobble the expressions as arguments.
   */
  protected parseArray(): ArrayExpression {
    this.index++;
    return {
      type: ParamNames.ArrayExpression,
      elements: this.parseArguments(ECharCodes.CloseBracket),
    };
  }

  /**
   * Responsible for parsing Map literals `[a: 1, b: 2, c: 3]`
   * This function assumes that it needs to gobble the opening brace
   * and then tries to gobble the expressions as arguments.
   */
  protected parseMap(): MapExpression {
    let ch: number;
    let closed = false;
    const elements: MapExpressionValues[] = [];
    ++this.index;
    while (this.index < this.length) {
      this.parseSpaces();

      ch = this.charCodeAt(this.index);

      if (ch === ECharCodes.CloseBrace) {
        ++this.index;
        closed = true;
        break;
      }

      if (ch !== ECharCodes.SingleQuote && ch !== ECharCodes.DoubleQuote) {
        throw new ParseError(`Invalid character ${String.fromCharCode(ch)}`, {
          start: this.index,
          end: this.index,
        });
      }
      const key = this.parseStringLiteral();

      this.parseSpaces();

      ch = this.charCodeAt(this.index);
      if (ch !== ECharCodes.Colon) {
        throw new ParseError(`Invalid character ${String.fromCharCode(ch)}`, {
          start: this.index,
          end: this.index,
        });
      }
      ++this.index;
      this.parseSpaces();

      const value = this.parseExpression();
      if (!value) {
        throw new ParseError(`Invalid character ${String.fromCharCode(ch)}`, {
          start: this.index,
          end: this.index,
        });
      }

      ch = this.charCodeAt(this.index);
      if (ch === ECharCodes.Comma) {
        ++this.index;
      }

      elements.push({
        key,
        value,
      });
    }

    if (!closed) {
      ch = this.charCodeAt(this.index);
      throw new ParseError('Unclosed {', {
        start: this.index,
        end: this.index,
      });
    }

    return {
      type: ParamNames.MapExpression,
      elements,
    };
  }
}
