import { NodeTypes } from '../enum/NodeTypes';
import { ParamNames } from '../enum/ParamNames';
import { AllParamTypes, Expression } from '../interface/Params';
import { Token } from '../interface/Tokens';
import { isSelfClosing } from '../utils/Tokens';
import AbstractAssign from './abstract/AbstractAssign';
import AbstractNode from './abstract/AbstractNode';

export default class AssignNode extends AbstractAssign {
  public params?: Expression[];
  public body?: AbstractNode[];

  constructor(token: Token) {
    super(NodeTypes.Assign, token);
    this.params = this.checkParams(token);

    // `<#assign x>…</#assign>` captures its body; `<#assign x = 1 />` and the
    // self-closing `[#assign x /]` do not.
    if (
      this.params.length === 1 &&
      this.params[0].type === ParamNames.Identifier &&
      !isSelfClosing(token)
    ) {
      this.body = [];
    }
  }

  protected isAssignmentExpressionSingle(
    param: AllParamTypes,
    token: Token,
  ): AllParamTypes {
    if (param.type === ParamNames.Identifier) {
      return param;
    }
    return super.isAssignmentExpressionSingle(param, token);
  }

  protected isAssignmentExpression(
    param: AllParamTypes,
    token: Token,
  ): AllParamTypes {
    if (param.type === ParamNames.UpdateExpression && !param.prefix) {
      return param;
    }
    return super.isAssignmentExpression(param, token);
  }
}
