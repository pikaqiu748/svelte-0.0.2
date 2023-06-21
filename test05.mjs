import { parseExpressionAt } from 'acorn'


console.log(parseExpressionAt('<div>{{test}}</div>',5));