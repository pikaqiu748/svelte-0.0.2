import { parseExpressionAt } from 'acorn'

export default function readExpression(parser) {
  try {
    // parse a single
    // expression in a string, and return its AST. It will not complain if
    // there is more of the string left after the expression.
    const node = parseExpressionAt(parser.template, parser.index)
    // console.log(parser.template,parser.index);
    parser.index = node.end

    // TODO check it's a valid expression. probably shouldn't have
    // [arrow] function expressions, etc
    return node
  } catch (err) {
    parser.acornError(err)
  }
}
