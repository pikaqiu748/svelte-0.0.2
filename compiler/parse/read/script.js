import { parse, tokenizer } from 'acorn'
import spaces from '../utils/spaces.js'

export default function readScript(parser, start, attributes) {
  // 以helper.js文件为例：
  // parser.index:41,export开始位置
  // start:<script>开始位置
  const scriptStart = parser.index
  let scriptEnd = null
  // parser.remaining():从export开始的剩余所有字符串
  // for of 	适用于数组
  for (const token of tokenizer(parser.remaining())) {
    parser.index = scriptStart + token.end
    // parser.index移动到非空格处，
    parser.allowWhitespace()
    // 	如果解析结束
    if (parser.eat('</script>')) {
      //scriptEnd： export {}的}位置
      scriptEnd = scriptStart + token.end
      break
    }
  }
  // parser.template.slice( scriptStart, scriptEnd ):包含整个export default{};内容
  // 返回对应数量的空格字符串，spaces(number)
  const source = spaces(scriptStart) + parser.template.slice(scriptStart, scriptEnd)
  let ast

  try {
	// 返回抽象语法树
    ast = parse(source, {
      // 设置你要解析的 JavaScript 的 ECMA 版本。默认是 ES7。
      ecmaVersion: 8,
      // 选择了 module，则不用严格模式声明，可以使用 import/export 语法。
      sourceType: 'module',
    })
  } catch (err) {
    parser.acornError(err)
  }

  ast.start = scriptStart
  return {
    start,
    end: parser.index,
    attributes,
    content: ast,
  }
}
