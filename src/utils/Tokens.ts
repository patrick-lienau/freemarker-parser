import { Token } from '../interface/Tokens';

/**
 * True when a tag closed itself (`<#t … />`, `[@m … /]`) rather than opening a
 * block.
 *
 * The tokenizer's terminator list is `['>', '/>']` in angle-tag mode and
 * `[']', '/]']` in square-tag mode, so the self-closing spelling differs by
 * syntax. Testing the leading slash covers both — checking for one literal
 * spelling silently mis-handles the other, which is what made every
 * square-syntax `[@macro … /]` open a body that was never closed.
 */
export function isSelfClosing(token: Token): boolean {
  return Boolean(token.endTag && token.endTag.startsWith('/'));
}
