import {parse} from 'acorn'
import { walk } from 'estree-walker'

const code = 'let message = "Hello, world!";if(a==1){console.log(a)}';
const ast = parse(code);

console.log('ast---------',ast);
walk(ast, {
    enter(node) {
        if (node.type === 'Identifier') {
            console.log('leave-----------',node.name);
        }
    },
    leave(node){
        console.log(node);
    }
});
