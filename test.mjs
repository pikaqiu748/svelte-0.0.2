// import { parseExpressionAt } from 'acorn';
import { parseExpressionAt } from 'acorn';

console.log(parseExpressionAt("<p>{{a}} + {{b}} = {{a + b}}</p>",5));
