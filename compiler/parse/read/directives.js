import { tokenizer, tokTypes, parseExpressionAt } from 'acorn'

export function readEventHandlerDirective(parser, start, name) {
  // 以event-handler为例，
  // parser:{
  // 	index: 17,
  // 	template: "<button on:click='set({ visible: !visible })'>toggle</button>\n" +
  // 	  '\n' +
  // 	  '{{#if visible}}\n' +
  // 	  '\t<p>hello!</p>\n' +
  // 	  '{{/if}}\n',
  // 	stack: [ { start: null, end: null, type: 'Fragment', children: [] } ],
  // 	current: [Function: current],
  // 	acornError: [Function: acornError],
  // 	error: [Function: error],
  // 	eat: [Function: eat],
  // 	match: [Function: match],
  // 	allowWhitespace: [Function: allowWhitespace],
  // 	read: [Function: read],
  // 	readUntil: [Function: readUntil],
  // 	remaining: [Function: remaining],
  // 	requireWhitespace: [Function: requireWhitespace],
  // 	html: { start: null, end: null, type: 'Fragment', children: [] },
  // 	css: null,
  // 	js: null
  //   }
  // start:8
  // name:click
  const quoteMark = parser.eat(`'`) ? `'` : parser.eat(`"`) ? `"` : null
  // start=8，on的位置
  const expressionStart = parser.index //17,set位置
  let end = null

  let depth = 0
  //   console.log('tokenizer( parser.remaining() ):', tokenizer(parser.remaining()))

  // tokTypes.parenL: TokenType {
  // 	label: '(',
  // 	keyword: undefined,
  // 	beforeExpr: true,
  // 	startsExpr: true,
  // 	isLoop: false,
  // 	isAssign: false,
  // 	prefix: false,
  // 	postfix: false,
  // 	binop: null,
  // 	updateContext: [Function (anonymous)]
  //   }

  //   tokTypes.parenR : TokenType {
  // 	label: ')',
  // 	keyword: undefined,
  // 	beforeExpr: false,
  // 	startsExpr: false,
  // 	isLoop: false,
  // 	isAssign: false,
  // 	prefix: false,
  // 	postfix: false,
  // 	binop: null,
  // 	updateContext: [Function (anonymous)]
  //   }
  for (const token of tokenizer(parser.remaining())) {
    if (token.type === tokTypes.parenL) depth += 1
    if (token.type === tokTypes.parenR) {
      depth -= 1
      if (depth === 0) {
        end = expressionStart + token.end
        break
      }
    }
  }

  const expression = parseExpressionAt(parser.template.slice(0, end), expressionStart)
  parser.index = expression.end

  if (expression.type !== 'CallExpression') {
    parser.error(`Expected call expression`, expressionStart)
  }
  // 解析完事件表示式后，必须也是以相应的单引号或者双引号结束
  if (quoteMark) {
    parser.eat(quoteMark, true)
  }

  //start表示on的开始，end表示 最后一个位置  on:click='set({ visible: !visible })‘
  return {
    start,
    end: parser.index,
    type: 'EventHandler',
    name, // 比如绑定事件时，name：'click'
    expression,
  }
}

export function readBindingDirective(parser, start, name) {
  // binding-input-checkbox文件为例
  // parser.index=36，表示‘foo'开始位置
  // start:23,表示bind开始位置
  // name=checked
  const quoteMark = parser.eat(`'`) ? `'` : parser.eat(`"`) ? `"` : null
  // 从parser.index位置匹配pattern,如果匹配成功，会将parser.index移动到匹配的字符串后面
  const value = parser.read(/([a-zA-Z_$][a-zA-Z0-9_$]*)(\.[a-zA-Z_$][a-zA-Z0-9_$]*)*/)
  if (!value) parser.error(`Expected valid property name`)
  if (quoteMark) {
  // 解析完属性值后，必须也是以相应的单引号或者双引号结束
    parser.eat(quoteMark, true)
  }

  return {
    start, //start:23,表示bind开始位置
    end: parser.index, //如果匹配成功，parser.index在属性值后面，例如在'foo'的后面
    type: 'Binding',
    name, //checked
    value, // 'foo'
  }
}
