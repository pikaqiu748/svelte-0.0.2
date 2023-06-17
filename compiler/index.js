import parse from './parse/index.js';
import generate from './generate/index.js';

export function compile ( template ) {
	// parse()返回的内容
	// return {
	// 	html: parser.html,
	// 	css: parser.css,
	// 	js: parser.js,
	//   }
	const parsed = parse( template );
	// TODO validate template
	const generated = generate( parsed, template );
	return generated;
}
