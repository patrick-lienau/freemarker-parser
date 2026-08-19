import { NodeTypes } from '../enum/NodeTypes';
import { Expression } from '../interface/Params';
import { Token } from '../interface/Tokens';
import AbstractAssign from './abstract/AbstractAssign';

export default class FtlNode extends AbstractAssign {
  public params?: Expression[];

  constructor(token: Token) {
    super(NodeTypes.Assign, token);
    // Every `#ftl` attribute (encoding, output_format, strip_whitespace, …) is
    // optional, so a bare `<#ftl>` is valid and carries no params. Inherited
    // checkParams() treats absent params as an error, which is right for
    // `#assign`/`#local`/`#global` but not here.
    this.params = token.params ? this.checkParams(token) : [];
  }
}
