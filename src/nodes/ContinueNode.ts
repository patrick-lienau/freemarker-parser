import { NodeTypes } from '../enum/NodeTypes';
import { Token } from '../interface/Tokens';
import AbstractNode from './abstract/AbstractNode';

/**
 * `<#continue>` — skip to the next iteration of the enclosing `#list`/`#items`.
 * Self-contained: no params, no body, exactly like `#break`.
 */
export default class ContinueNode extends AbstractNode {
  constructor(token: Token) {
    super(NodeTypes.Continue, token);
    this.noParams(token);
  }
}
