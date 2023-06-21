import { parseExpressionAt } from 'acorn'

// Acorn.parseExpressionAt
// 可以从任意字符串中提取表达式，比如在解析下面的HTML时，可以通过 parseExpressionAt('test}</h2>') 方法, 将test变量提取成AST表达式
// <h1>{test}</h2>
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
