import { NodeTypes } from '../enum/NodeTypes';
import { Expression } from '../interface/Params';
import { Token } from '../interface/Tokens';
import { paramParser } from '../utils/Params';
import AbstractNode from './abstract/AbstractNode';

/**
 * `<#nested>` / `<#nested loopVar1, loopVar2, …>` — renders the nested content
 * passed to the enclosing macro, optionally exposing loop variables. It is a
 * void directive (no body of its own); the optional params are the loop-var
 * value expressions.
 */
export default class NestedNode extends AbstractNode {
  public params?: Expression;

  constructor(token: Token) {
    super(NodeTypes.Nested, token);
    this.params = paramParser(token);
  }
}
