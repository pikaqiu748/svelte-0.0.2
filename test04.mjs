
import MagicString from 'magic-string'
import fs from 'fs'

const s = new MagicString('const problems = 99;function test(){}');

s.overwrite(0, 8, 'answer');
console.log(s.toString()); // "answer = 99"

s.overwrite(11, 13, '42'); // character indices always refer to the original string
console.log(s.toString()); // "answer = 42"

s.prepend('const ').append(';'); // most methods on a MagicString instance are chainable
console.log(s.toString()); // "const answer = 42;"

const map = s.generateMap({
  source: 'source.js',
  file: 'converted.js.map',
  includeContent: true,
}); // generates a v3 source map

fs.writeFileSync('converted.js', s.toString());
fs.writeFileSync('converted.js.map', map.toString());