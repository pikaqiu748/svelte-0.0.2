import { locate } from 'locate-character'
import fragment from './state/fragment.js'
import { whitespace } from './patterns.js'
import { trimStart, trimEnd } from './utils/trim.js'
import spaces from './utils/spaces.js'

function tabsToSpaces(str) {
  return str.replace(/^\t+/, (match) => match.split('\t').join('  '))
}

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

    error(message, index = this.index) {
      throw new ParseError(message, this.template, index)
    },

    eat(str, required) {
      if (this.match(str)) {
        // 将index移动到<!--后面的位置
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

    allowWhitespace() {
      while (this.index < this.template.length && whitespace.test(this.template[this.index])) {
        this.index++
      }
    },

    read(pattern) {
      const match = pattern.exec(this.template.slice(this.index))
      if (!match || match.index !== 0) return null

      parser.index += match[0].length

      return match[0]
    },

    readUntil(pattern) {
      // exec method will return a result array,others it returns null
      const match = pattern.exec(this.template.slice(this.index))
      //   match.index is the position of pattern in template,
      // it is say that if match successfully,it will return comment part
      // between <!-- and -->
      return this.template.slice(this.index, match ? (this.index += match.index) : this.template.length)
    },

    remaining() {
      return this.template.slice(this.index)
    },

    requireWhitespace() {
      if (!whitespace.test(this.template[this.index])) {
        this.error(`Expected whitespace`)
      }

      this.allowWhitespace()
    },

    html: {
      start: null,
      end: null,
      type: 'Fragment',
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
  // trim unnecessary whitespace

  while (parser.html.children.length) {
    // console.log('length',parser.html);
    const firstChild = parser.html.children[0]
    parser.html.start = firstChild.start

    if (firstChild.type !== 'Text') break

    const length = firstChild.data.length
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
    lastChild.data = trimEnd(lastChild.data)

    if (lastChild.data === '') {
      parser.html.children.pop()
    } else {
      parser.html.end -= length - lastChild.data.length
      break
    }
  }
  // 即parser函数返回一个对象，分别包含html，css,js
  return {
    html: parser.html,
    css: parser.css,
    js: parser.js,
  }
}
