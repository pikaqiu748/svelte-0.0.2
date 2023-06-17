import { locate } from 'locate-character'
import fragment from './state/fragment.js'
import { whitespace } from './patterns.js'
import { trimStart, trimEnd } from './utils/trim.js'
import spaces from './utils/spaces.js'

function tabsToSpaces(str) {
  return str.replace(/^\t+/, (match) => match.split('\t').join('  '))
}

// 输出带line number的解析错误信息
function ParseError(message, template, index) {
  const { line, column } = locate(template, index)
  const lines = template.split('\n')

  const frameStart = Math.max(0, line - 2)
  const frameEnd = Math.min(line + 3, lines.length)

  const digits = String(frameEnd + 1).length
  const frame = lines
    .slice(frameStart, frameEnd)
    .map((str, i) => {
      const isErrorLine = frameStart + i === line

      let lineNum = String(i + frameStart + 1)
      while (lineNum.length < digits) lineNum = ` ${lineNum}`

      if (isErrorLine) {
        const indicator = spaces(digits + 2 + tabsToSpaces(str.slice(0, column)).length) + '^'
        return `${lineNum}: ${tabsToSpaces(str)}\n${indicator}`
      }

      return `${lineNum}: ${tabsToSpaces(str)}`
    })
    .join('\n')

  this.message = `${message} (${line + 1}:${column})\n${frame}`
  this.loc = { line, column }
  this.shortMessage = message
}

// 解析器
export default function parse(template) {
  const parser = {
    index: 0,
    template,
    stack: [],

    current() {
      return this.stack[this.stack.length - 1]
    },

    acornError(err) {
      parser.error(err.message.replace(/\(\d+:\d+\)$/, ''), err.pos)
    },

    // 错误提示函数
    error(message, index = this.index) {
      throw new ParseError(message, this.template, index)
    },

    // 判断模版字符串中的this.index位置开始，是否匹配str成功
    // 同时如果传入参数required=true，匹配失败，则进行提示
    eat(str, required) {
      if (this.match(str)) {
        this.index += str.length
        return true
      }

      if (required) {
        this.error(`Expected ${str}`)
      }
    },

    match(str) {
      // 根据str.length，判断传入的template的前str.length字符是否等于str
      return this.template.slice(this.index, this.index + str.length) === str
    },
    // 如果template中的this.index位置为空格,包括换行符，则this.index++
    allowWhitespace() {
      while (this.index < this.template.length && whitespace.test(this.template[this.index])) {
        this.index++
      }
    },

    read(pattern) {
      // 进行模式匹配
      const match = pattern.exec(this.template.slice(this.index))
      // 如果不含模式串或者开头匹配失败
      if (!match || match.index !== 0) return null
      // 开头匹配成功，将this.index后移到匹配内容的后面，
      parser.index += match[0].length
      // 同时返回匹配字符串
      return match[0]
    },

    // 读取从this.index到模式串之前的内容，如果没有模式串，则直接读取this.index后面的剩余部分
    readUntil(pattern) {
      // exec method will return a result array,others it returns null
      const match = pattern.exec(this.template.slice(this.index))
      return this.template.slice(this.index, match ? (this.index += match.index) : this.template.length)
    },
    // 返回template中this.index后面的剩余部分
    remaining() {
      return this.template.slice(this.index)
    },
    // 判断字符串中是否含有空格，没有则报错
    requireWhitespace() {
      if (!whitespace.test(this.template[this.index])) {
        this.error(`Expected whitespace`)
      }

      this.allowWhitespace()
    },

    html: {
      // html片段的开始位置和结束位置
      start: null,
      end: null,
      type: 'Fragment',
      //在解析.svelte文件中的html时，如果html有多行（这种情况很常见），则首先会将所有的html拼接成一行
      // 即拼接后，行与行之间也会有‘\n',例如<span>test</test>\n<div>hello</div>
      // 则在children中的存储模式为：
      // {
      //   start: 0,
      //   end: 17,
      //   type: 'Element',
      //   name: 'span',
      //   attributes: [],
      //   children: [Array]
      // },
      // {
      //   start: 17,
      //   end: 18,
      //   type: 'Text',
      //   name: '\n',
      // },
      // {
      //   start: 18,
      //   end: 33,
      //   type: 'Element',
      //   name: 'div',
      //   attributes: [],
      //   children: [Array]
      // },
      // {
      //   start: 33,
      //   end: 34,
      //   type: 'Text',
      //   name: '\n',
      // },
      children: [],
    },

    css: null,

    js: null,
  }
  //上面parser对象中satck压入parser对象中的html对象
  parser.stack.push(parser.html)

  // fragment函数，回根据参数‘<'或者‘{{’进行匹配,返回tag函数或者mustache函数，这两个函数分别解析对应的标签
  // 否则为文本，直接返回text文本
  let state = fragment
  //   parser对象中的index默认为0,parser.template是parser函数传来的参数，即.svelte文件内容
  while (parser.index < parser.template.length) {
    // 返回对应的解析函数，并且如果parser.index小于parser.template.length，则继续执行返回的函数
    // state(parser)如果匹配到注释，则会返回null，此时如果parser.index小于parser.template.length，则会继续执行fragment函数
    state = state(parser) || fragment
  }
  // console.log('after parser:', parser.html.children[0].children)

// single-static-element 的   parser.html.children
  // [
  //   {
  //     start: 0,
  //     end: 17,
  //     type: 'Element',
  //     name: 'span',
  //     attributes: [],
  //     children: [ [Object] ]
  //   },
  //   { start: 17, end: 18, type: 'Text', data: '\n' }
  // ]
  // trim unnecessary whitespace
  while (parser.html.children.length) {
    const firstChild = parser.html.children[0]
    parser.html.start = firstChild.start

    if (firstChild.type !== 'Text') break

    const length = firstChild.data.length
    // 将字符串开头空格去掉，包括换行符，并返回剩余字符串
    firstChild.data = trimStart(firstChild.data)

    if (firstChild.data === '') {
      parser.html.children.shift()
    } else {
      parser.html.start += length - firstChild.data.length
      break
    }
  }

  while (parser.html.children.length) {
    const lastChild = parser.html.children[parser.html.children.length - 1]
    parser.html.end = lastChild.end
    
    if (lastChild.type !== 'Text') break
    
    const length = lastChild.data.length
    //如果是Text类型，则添加data属性，且为去除空格的长度，包括换行符。
    lastChild.data = trimEnd(lastChild.data)
    if (lastChild.data === '') {
      // 最后一个child全部为空格，则去掉该child
      parser.html.children.pop()
    } else {
      // length为trimEnd之前的总长度，即包括空格的长度。
      // lastChild.data.length为去除空格后的长度
      // 更新html片段的结束位置
      parser.html.end -= length - lastChild.data.length

      break
    }
  }
  // 即parser函数返回一个对象，分别包含html，css,js
  // console.log(parser.html.children[0].children[0].expression?parser.html.children[0].children[0].expression:"");
  return {
    html: parser.html,
    css: parser.css,
    js: parser.js,
  }
}
