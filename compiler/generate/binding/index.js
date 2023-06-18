import deindent from '../utils/deindent.js'
import isReference from '../utils/isReference.js'
import flattenReference from '../utils/flattenReference.js'

//  binding-input-text-deep-contextual文件
//node: {
//   start: 30,
//   end: 67,
//   type: 'Element',
//   name: 'input',
//   attributes: [
//     {
//       start: 37,
//       end: 66,
//       type: 'Binding',
//       name: 'value',
//       value: 'item.description'
//     }
//   ],
//   children: []
// }

// name:input

//attribute: {
//   start: 37,
//   end: 66,
//   type: 'Binding',
//   name: 'value',
//   value: 'item.description'
// }

//current: {
//   useAnchor: false,
//   name: 'renderEachBlock_0',
//   target: 'div',
//   expression: Node { type: 'Identifier', start: 8, end: 13, name: 'items' },
//   context: 'item',
//   contexts: { item: true },
// indexes: {},
// indexNames: { item: 'item__index' },
// listNames: { item: 'eachBlock_0_value' },
// contextChain: [ 'root', 'eachBlock_0_value', 'item', 'item__index' ],
// initStatements: [ "var div = document.createElement( 'div' );" ],
// updateStatements: [ 'var item = eachBlock_0_value[item__index];' ],
// teardownStatements: [ 'div.parentNode.removeChild( div );' ],
// counter: [Function (anonymous)],
// parent: {
//   useAnchor: false,
//   name: 'renderEachBlock_0',
//   target: 'target',
//   expression: Node { type: 'Identifier', start: 8, end: 13, name: 'items' },
//   context: 'item',
//   contexts: { item: true },
//     indexes: {},
//     indexNames: { item: 'item__index' },
//     listNames: { item: 'eachBlock_0_value' },
//     contextChain: [ 'root', 'eachBlock_0_value', 'item', 'item__index' ],
//     initStatements: [ "var div = document.createElement( 'div' );" ],
//     updateStatements: [ 'var item = eachBlock_0_value[item__index];' ],
//     teardownStatements: [ 'div.parentNode.removeChild( div );' ],
//     counter: [Function (anonymous)],
//     parent: {
//       useAnchor: false,
//       name: 'renderMainFragment',
//       target: 'target',
//       initStatements: [Array],
//       updateStatements: [Array],
//       teardownStatements: [Array],
//       contexts: {},
//       indexes: {},
//       contextChain: [Array],
//       indexNames: {},
//       listNames: {},
//       counter: [Function (anonymous)],
//       parent: null
//     }
//   }
// }

//initStatements: [ "var input = document.createElement( 'input' );" ]
// updateStatements:[]
// teardownStatements:[]
// allUsedContexts:set{}
export default function createBinding(node, name, attribute, current, initStatements, updateStatements, teardownStatements, allUsedContexts) {
  // attribute.value:item.description
  const parts = attribute.value.split('.')

  const deep = parts.length > 1
  //  current.contexts:  { item: true }
  //   contextual:true
  const contextual = parts[0] in current.contexts
  if (contextual) allUsedContexts.add(parts[0])
  // name:input
  const handler = current.counter(`${name}ChangeHandler`)
  // handler:  inputChangeHandler
  let setter

  let eventName = 'change'
  if (node.name === 'input') {
    //  node.attributes: [
    //     {
    //       start: 37,
    //       end: 66,
    //       type: 'Binding',
    //       name: 'value',
    //       value: 'item.description'
    //     }
    //   ],
    const type = node.attributes.find((attr) => attr.type === 'Attribute' && attr.name === 'type')
    // type:undefined
    if (!type || type.value[0].data === 'text') {
      // TODO in validation, should throw if type attribute is not static
      eventName = 'input'
    }
  }
  //   contextual:true
  if (contextual) {
    // find the top-level property that this is a child of
    let fragment = current
    // prop:item
    let prop = parts[0]

    do {
      //   expression: Node { type: 'Identifier', start: 8, end: 13, name: 'items' },
      // current.context:context: 'item',
      //   prop:item
      if (fragment.expression && fragment.context === prop) {
        if (!isReference(fragment.expression)) {
          // TODO this should happen in prior validation step
          throw new Error(`${prop} is read-only, it cannot be bound`)
        }

        prop = flattenReference(fragment.expression).name
      }
    } while ((fragment = fragment.parent))
    // prop: 'items'
    const listName = current.listNames[parts[0]]
    //listName: eachBlock_0_value
    const indexName = current.indexNames[parts[0]]
    // indexName:item__index
    setter = deindent`
			var list = this.__svelte.${listName};
			var index = this.__svelte.${indexName};
			list[index]${parts
        .slice(1)
        .map((part) => `.${part}`)
        .join('')} = this.${attribute.name};

			component.set({ ${prop}: component.get( '${prop}' ) });
		`
  } else if (deep) {
    setter = deindent`
			var ${parts[0]} = component.get( '${parts[0]}' );
			${parts[0]}.${parts.slice(1).join('.')} = this.${attribute.name};
			component.set({ ${parts[0]}: ${parts[0]} });
		`
  } else {
    setter = `component.set({ ${attribute.value}: ${name}.${attribute.name} });`
  }

  initStatements.push(deindent`
		var ${name}_updating = false;

		function ${handler} () {
			${name}_updating = true;
			${setter}
			${name}_updating = false;
		}

		${name}.addEventListener( '${eventName}', ${handler}, false );
	`)
  //initStatements: [
  // 	"var input = document.createElement( 'input' );",
  // 	'var input_updating = false;\n' +
  // 	  '\n' +
  // 	  'function inputChangeHandler () {\n' +
  // 	  '\tinput_updating = true;\n' +
  // 	  '\tvar list = this.__svelte.eachBlock_0_value;\n' +
  // 	  '\tvar index = this.__svelte.item__index;\n' +
  // 	  '\tlist[index].description = this.value;\n' +
  // 	  '\t\n' +
  // 	  "\tcomponent.set({ items: component.get( 'items' ) });\n" +
  // 	  '\tinput_updating = false;\n' +
  // 	  '}\n' +
  // 	  '\n' +
  // 	  "input.addEventListener( 'input', inputChangeHandler, false );"
  //   ]
  updateStatements.push(deindent`
		if ( !${name}_updating ) ${name}.${attribute.name} = ${contextual ? attribute.value : `root.${attribute.value}`}
	`)
  //updateStatements: [ 'if ( !input_updating ) input.value = item.description' ]
  teardownStatements.push(deindent`
		${name}.removeEventListener( '${eventName}', ${handler}, false );
	`)
  // [ "input.removeEventListener( 'input', inputChangeHandler, false );" ]
}
