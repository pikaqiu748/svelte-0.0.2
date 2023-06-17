// import { parseExpressionAt } from 'acorn';
import { parseExpressionAt } from 'acorn';

console.log(parseExpressionAt(`{{#each items as item, i}}<div class='{{item.foo ? "foo" : ""}} {{item.bar ? "bar" : ""}}'>{{i + 1}}</div>
{{/each}}
`,40));

// Node {
//     type: 'ConditionalExpression',
//     start: 42,
//     end: 61,
//     test: Node {
//       type: 'MemberExpression',
//       start: 42,
//       end: 48,
//       object: Node { type: 'Identifier', start: 42, end: 44, name: 'em' },
//       property: Node { type: 'Identifier', start: 45, end: 48, name: 'foo' },
//       computed: false
//     },
//     consequent: Node {
//       type: 'Literal',
//       start: 51,
//       end: 56,
//       value: 'foo',
//       raw: '"foo"'
//     },
//     alternate: Node { type: 'Literal', start: 59, end: 61, value: '', raw: '""' }
//   }