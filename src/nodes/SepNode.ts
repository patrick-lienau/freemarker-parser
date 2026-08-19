import { NodeTypes } from '../enum/NodeTypes';
import { Token } from '../interface/Tokens';
import AbstractNode from './abstract/AbstractNode';

/**
 * `<#sep>` — content emitted between iterations of the enclosing `#list`, but
 * not after the last one.
 *
 * FreeMarker allows two spellings and both are supported:
 *
 *   <#list xs as x>${x}<#sep>, </#sep></#list>   explicit close
 *   <#list xs as x>${x}<#sep>, </#list>          runs to the end of the list
 *
 * The second has no close tag, so the node is closed implicitly when its
 * enclosing list closes — see `Parser.parse`'s auto-close of implicitly
 * closable nodes.
 */
export default class SepNode extends AbstractNode {
  public body: AbstractNode[];

  get hasBody(): boolean {
    return true;
  }

  constructor(token: Token) {
    super(NodeTypes.Sep, token);
    this.noParams(token);
    this.body = [];
  }

  public addToNode(child: AbstractNode): void {
    this.body.push(child);
  }
}
