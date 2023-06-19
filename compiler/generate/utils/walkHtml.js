export default function walkHtml ( html, visitors ) {
	function visit ( node ) {
		//node.type: Element,Text,MustacheTag,EachBlock,IfBlock
		const visitor = visitors[ node.type ];
		// 获取对应的visitor对象，里面可能包括enter()和leave()方法
		if ( !visitor ) throw new Error( `Not implemented: ${node.type}` );

		if ( visitor.enter ) visitor.enter( node );

		if ( node.children ) {
			node.children.forEach( child => {
				visit( child );
			});
		}

		if ( visitor.leave ) visitor.leave( node );
	}

	visit( html );
}
