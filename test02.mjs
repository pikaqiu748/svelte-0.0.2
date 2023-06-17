import { parse, tokenizer } from 'acorn';


const tokeners=tokenizer(`export default {
    helpers: {
        reverse ( str ) {
            let reversed = '';
            let i = str.length;
            while ( i-- ) reversed += str[i];
            return reversed;
        }
    }
};
</script>`)
console.log(tokeners);
console.log('hhaa',Array.isArray(tokeners));

for(const token of tokeners){
    console.log('token:',token);
}


