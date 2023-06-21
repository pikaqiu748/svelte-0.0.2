//  binding-input-text-deep-contextual文件为例
//  第一个参数：Node { type: 'Identifier', start: 8, end: 13, name: 'items' },

// 方括号里的 key
// > cd = `dict[key]`
// > parse(cd).body[0]
// Node {
//   type: 'ExpressionStatement',
//   expression: Node {
//     type: 'MemberExpression',
//     object: Node { type: 'Identifier', name: 'dict' },
//     computed: true,
//     property: Node { type: 'Identifier', name: 'key' }
//   }
// }

// 判断变量是否是一个引用。 如下代码，add函数中count是一个对外部定义的变量的引用，如果引用值是一个writable或mutated的变量，则会将count作为依赖进行收集

// function add () {
//     count += 1
// }
export default function isReference(node, parent) {
  if (node.type === 'MemberExpression') {
    // MemberExpression 表示 a.b或者a[b]这样的语句，第一种方式computed为false,第二种computed为true
    return !node.computed && isReference(node.object, node)
  }
  // 标识符
  if (node.type === 'Identifier') {
    // the only time we could have an identifier node without a parent is
    // if it's the entire body of a function without a block statement –
    // i.e. an arrow function expression like `a => a`
    if (!parent) return true

    // TODO is this right?
    if (parent.type === 'MemberExpression' || parent.type === 'MethodDefinition') {
      return parent.computed || node === parent.object
    }

    //  对象表达式中的属性节点。key 表示键，value 表示值，由于 ES5 语法中有 get/set 的存在，所以有一个 kind 属性，用来表示是普通的初始化，或者是 get/set。
    // interface Property <: Node {

    //     type: "Property";

    //     key: Literal | Identifier;

    //     value: Expression;

    //     kind: "init" | "get" | "set";

    // }

    // disregard the `bar` in `{ bar: foo }`, but keep it in `{ [bar]: foo }`
    if (parent.type === 'Property') return parent.computed || node === parent.value

    // disregard the `bar` in `class Foo { bar () {...} }`
    if (parent.type === 'MethodDefinition') return false

    // disregard the `bar` in `export { foo as bar }`
    if (parent.type === 'ExportSpecifier' && node !== parent.local) return

    return true
  }
}
