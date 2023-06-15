import tag from './tag.js';
import mustache from './mustache.js';
import text from './text.js';

export default function fragment ( parser ) {
	// console.log('parser.index:',parser.index);
	// console.log('parser', parser);
	// console.log('parser.match("<"):',parser.match('<'));
	// 调用parser对象中的march方法
	if ( parser.match( '<' ) ) {
		return tag;
	}

	if ( parser.match( '{{' ) ) {
		return mustache;
	}

	return text;
}
