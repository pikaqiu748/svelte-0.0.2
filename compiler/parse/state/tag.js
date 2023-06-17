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
  // 例如解析attribute-static-boolean时，while的第二次再次调用readAttribute()时，回返回null,结束while
  while ((attribute = readAttribute(parser))) {
    // console.log('attribute',attribute);
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
  // textarea会直接来到这里
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
    // 压入栈，进行该child节点的下一次解析。
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

  // 针对比如style=  或者class=，readonly=,返回属性值，要么是data字段表示，要么是expression表示
  // readAttributeValue返回chunks数组，即匹配到的各种语法块的表示
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
  // console.log('parser', parser)
  //例如 "<textarea readonly='{{readonly}}'></textarea>"   index=20，从{{开始
  while (parser.index < parser.template.length) {
    if (escaped) {
      // 此时currentChunk.data=
      currentChunk.data += parser.template[parser.index++]
    } else {
      // 获取开始解析的位置
      const index = parser.index
      // 开始位置为{{开头,例如test/compiler/attribute-dynamic-multiple/main.svelte
      if (parser.eat('{{')) {
        // console.log('parser',parser);
        currentChunk.end = index
        // console.log('currentChunk',currentChunk);
        // 此时currentChunk为:{ start: 20, end: 20, type: 'Text', data: '' }
        if (currentChunk.data) {
          chunks.push(currentChunk)
        }

        // parser {
        //   index: 20,
        //   template: "<textarea readonly='{{readonly}}'></textarea>",
        //   stack: [ { start: null, end: null, type: 'Fragment', children: [] } ],
        //   current: [Function: current],
        //   acornError: [Function: acornError],
        //   error: [Function: error],
        //   eat: [Function: eat],
        //   match: [Function: match],
        //   allowWhitespace: [Function: allowWhitespace],
        //   read: [Function: read],
        //   readUntil: [Function: readUntil],
        //   remaining: [Function: remaining],
        //   requireWhitespace: [Function: requireWhitespace],
        //   html: { start: null, end: null, type: 'Fragment', children: [] },
        //   css: null,
        //   js: null
        // }
        // 传入的parser如上所示,readExpression会从{{readonly=开始解析，并返回相应的语法树
        const expression = readExpression(parser)
        // console.log('expression',expression);
        // 将index移动到非空格处
        // console.log('this.index',parser.template.slice(parser.index));
        parser.allowWhitespace()
        // 读取完表达式，如果不是以}}结尾，则说明格式错误
        if (!parser.eat('}}')) {
          parser.error(`Expected }}`)
        }
        //  attribute-dynamic-multiple就有多个chunk,里面的两个mustache就是两个chunk,还有中间的一个空格也是
        chunks.push({
          start: index,
          // parser.index已经到了readonly}}这里,正好start,end分别表示MustacheTag的开始和结束位置
          // 就是说，chunk为匹配的当前语法块的开始和结束等信息
          end: parser.index,
          type: 'MustacheTag',
          expression,
        })
        // console.log('chunk',parser.index);
        currentChunk = {
          start: parser.index,
          end: null,
          type: 'Text',
          data: '',
        }
      } else if (parser.eat('\\')) {
        escaped = true
      } else if (parser.match(quoteMark)) {
        // 第一轮解析readonly的mustache后，会走这里，此时parser.index=32
        currentChunk.end = parser.index++
        // 此时第二轮的readonly解析，currentChunk.data为空，所以不会压入chunks中，
        // 并直接返回chunks，结束readonly的解析
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
