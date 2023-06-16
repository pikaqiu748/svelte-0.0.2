import readExpression from '../read/expression.js'
import readScript from '../read/script.js'
import readStyle from '../read/style.js'
import { readEventHandlerDirective, readBindingDirective } from '../read/directives.js'
import { trimStart, trimEnd } from '../utils/trim.js'

const validTagName = /^[a-zA-Z]{1,}:?[a-zA-Z0-9\-]*/
const voidElementNames = /^(?:area|base|br|col|command|doctype|embed|hr|img|input|keygen|link|meta|param|source|track|wbr)$/i

const specials = {
  script: {
    read: readScript,
    property: 'js',
  },

  style: {
    read: readStyle,
    property: 'css',
  },
}

export default function tag(parser) {
  // parser.index++,是为了排除template字符串中开头的'/n'
  const start = parser.index++
  // 在匹配到首字符为'<'的情况下，再判断是否为注释
  if (parser.eat('!--')) {
    // the data presents for comment content
    const data = parser.readUntil(/-->/)
    // parser.index move to the next one position ,after comment
    parser.eat('-->')
    // parser.current returns html object inside parser
    parser.current().children.push({
      start,
      // parser.index has removed to the first position of html
      end: parser.index,
      type: 'Comment',
      data,
    })

    return null
  }
  // just like </>
  const isClosingTag = parser.eat('/')

  // TODO handle cases like <li>one<li>two

  const name = readTagName(parser)

  parser.allowWhitespace()

  if (isClosingTag) {
    if (!parser.eat('>')) parser.error(`Expected '>'`)

    const element = parser.current()

    // strip leading/trailing whitespace as necessary
    if (element.children.length) {
      const firstChild = element.children[0]
      const lastChild = element.children[element.children.length - 1]

      if (firstChild.type === 'Text') {
        firstChild.data = trimStart(firstChild.data)
        if (!firstChild.data) element.children.shift()
      }

      if (lastChild.type === 'Text') {
        lastChild.data = trimEnd(lastChild.data)
        if (!lastChild.data) element.children.pop()
      }
    }

    element.end = parser.index
    parser.stack.pop()

    return null
  }

  const attributes = []

  let attribute
  while ((attribute = readAttribute(parser))) {
    attributes.push(attribute)
    parser.allowWhitespace()
  }

  parser.allowWhitespace()

  // special cases – <script> and <style>
  if (name in specials) {
    const special = specials[name]
    if (parser[special.id]) {
      parser.index = start
      parser.error(`You can only have one <${name}> tag per component`)
    }
    // 表示当前位置必须以>开头
    parser.eat('>', true)
    // 即parser['js']=...
    parser[special.property] = special.read(parser, start, attributes)
    return
  }

  const element = {
    start,
    end: null, // filled in later
    type: 'Element',
    name,
    attributes,
    children: [],
  }

  parser.current().children.push(element)

  const selfClosing = parser.eat('/') || voidElementNames.test(name)

  parser.eat('>', true)

  if (selfClosing) {
    element.end = parser.index
  } else {
    // don't push self-closing elements onto the stack,because it have no child.
    parser.stack.push(element)
  }

  return null
}

function readTagName(parser) {
  const start = parser.index
  const name = parser.readUntil(/(\s|\/|>)/)
  // like button  li and so on.
  if (!validTagName.test(name)) {
    parser.error(`Expected valid tag name`, start)
  }

  return name
}

function readAttribute(parser) {
  const start = parser.index
  // 这个正则表达式是一个字符集合，表示匹配包括空格（\s）、等号（=）、斜杠（/）和大于号（>）在内的任意一个字符。
  // 下句返回属性名，例如 style='...',返回style。class='...',返回class.<textarea readonly>返回readonly
  // <button on:click='set({ visible: !visible })'>返回 on:click
  // {/* <input type='checkbox' bind:checked='foo'> */}  分别返回type 和bind:checked
  // <input ref:input autofocus>返回ref:input
  const name = parser.readUntil(/(\s|=|\/|>)/)
  if (!name) return null
  // console.log('name', name)
  parser.allowWhitespace()

  // 如果匹配到事件
  if (/^on:/.test(name)) {
    // 再往下开头的匹配必须是等号
    parser.eat('=', true)
    return readEventHandlerDirective(parser, start, name.slice(3))
  }
  // 匹配到属性值绑定
  if (/^bind:/.test(name)) {
    // 再往下开头的匹配必须是等号
    parser.eat('=', true)
    return readBindingDirective(parser, start, name.slice(5))
  }
  // 匹配到ref引用
  if (/^ref:/.test(name)) {
    return {
      start,
      end: parser.index,
      type: 'Ref',
      name: name.slice(4),
    }
  }

  // 针对比如style=  或者class=，返回属性值，要么是data字段表示，要么是expression表示
  const value = parser.eat('=') ? readAttributeValue(parser) : true

  return {
    start,
    end: parser.index,
    type: 'Attribute',
    name,
    value,
  }
}

function readAttributeValue(parser) {
  if (parser.eat(`'`)) return readQuotedAttributeValue(parser, `'`)
  if (parser.eat(`"`)) return readQuotedAttributeValue(parser, `"`)

  parser.error(`TODO unquoted attribute values`)
}

function readQuotedAttributeValue(parser, quoteMark) {
  // 用来表示当前属性值信息的一个对象
  let currentChunk = {
    start: parser.index,
    end: null,
    type: 'Text',
    data: '',
  }

  let escaped = false

  const chunks = []

  while (parser.index < parser.template.length) {
    if (escaped) {
      currentChunk.data += parser.template[parser.index++]
    } else {
      // 获取开始解析的位置
      const index = parser.index
      // 开始位置为{{开头,例如test/compiler/attribute-dynamic-multiple/main.svelte
      if (parser.eat('{{')) {
        // console.log('parser',parser);
        currentChunk.end = index

        if (currentChunk.data) {
          chunks.push(currentChunk)
        }

        const expression = readExpression(parser)
        // console.log('expression',expression);
        // 将index移动到非空格处
        parser.allowWhitespace()
        // 读取完表达式，如果不是以}}结尾，则说明格式错误
        if (!parser.eat('}}')) {
          parser.error(`Expected }}`)
        }
        //  attribute-dynamic-multiple就有多个chunk,里面的两个mustache就是两个chunk,还有中间的一个空格也是
        chunks.push({
          start: index,
          end: parser.index,
          type: 'MustacheTag',
          expression,
        })

        currentChunk = {
          start: parser.index,
          end: null,
          type: 'Text',
          data: '',
        }
      } else if (parser.eat('\\')) {
        escaped = true
      } else if (parser.match(quoteMark)) {
        // 开始位置传入参数quoteMark为开头,例如test/compiler/binding-input-checkbox/main.svelte
        currentChunk.end = parser.index++

        if (currentChunk.data) chunks.push(currentChunk)
        // 例如test/compiler/binding-input-checkbox/main.svelte,
        // 返回chunks：[ { start: 13, end: 21, type: 'Text', data: 'checkbox' } ]
        return chunks
      } else {
        currentChunk.data += parser.template[parser.index++]
      }
      // 第一层else结束,对应第一个if
    }
    // while结束
  }

  parser.error(`Unexpected end of input`)
}
