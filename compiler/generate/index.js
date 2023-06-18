import MagicString from 'magic-string'
import { walk } from 'estree-walker'
import deindent from './utils/deindent.js'
import walkHtml from './utils/walkHtml.js'
import isReference from './utils/isReference.js'
import contextualise from './utils/contextualise.js'
import counter from './utils/counter.js'
import attributeLookup from './attributes/lookup.js'
import createBinding from './binding/index.js'

function createRenderer(fragment) {
  if (fragment.autofocus) {
    fragment.initStatements.push(`${fragment.autofocus}.focus();`)
  }

  return deindent`
		function ${fragment.name} ( component, target${fragment.useAnchor ? ', anchor' : ''} ) {
			${fragment.initStatements.join('\n\n')}

			return {
				update: function ( ${fragment.contextChain.join(', ')} ) {
					${fragment.updateStatements.join('\n\n')}
				},

				teardown: function () {
					${fragment.teardownStatements.join('\n\n')}
				}
			};
		}
	`
}

export default function generate(parsed, template) {
  //  template 整个文件内容
  // parsed,源文件编译后的内容
  const code = new MagicString(template)
  // console.log('code-------',code);
  function addSourcemapLocations(node) {
    // parsed.js.content:文件中的export {}部分。
    // {
    //   type: 'Program',
    //   start: 21,
    //   end: 153,
    //   body: [
    //     Node {
    //       type: 'ExportDefaultDeclaration',
    //       start: 23,
    //       end: 153,
    //       declaration: [Node]
    //     }
    //   ],
    //   sourceType: 'module'
    // }
    // walk()函数中可以传入 options，其中 enter() 在每次访问AST节点的时候会被调用，leave() 则是在离开 AST节点
    // 的时候被调用。
    // 函数链接：https://blog.csdn.net/weixin_56658592/article/details/121598876
    walk(node, {
      enter(node) {
        code.addSourcemapLocation(node.start)
        code.addSourcemapLocation(node.end)
      },
    })
  }

  const templateProperties = {}

  // 如果源文件有js代码
  if (parsed.js) {
    // parsed.js.content:文件中的export {}部分。
    // {
    //   type: 'Program',
    //   start: 21,
    //   end: 153,
    //   body: [
    //     Node {
    //       type: 'ExportDefaultDeclaration',
    //       start: 23,
    //       end: 153,
    //       declaration: [Node]
    //     }
    //   ],
    //   sourceType: 'module'
    // }
    addSourcemapLocations(parsed.js.content)
    // 文件lifecycle-events为例
    // 找到返回export{}部分信息
    //  {
    //   type: 'ExportDefaultDeclaration',
    //   start: 23,
    //   end: 153,
    //   declaration: Node {
    //     type: 'ObjectExpression',
    //     start: 38,
    //     end: 152,
    //     properties: [ [Node], [Node] ]
    //   }
    // }
    const defaultExport = parsed.js.content.body.find((node) => node.type === 'ExportDefaultDeclaration')
    if (defaultExport) {
      // 'export default {'  to   'const template ='
      code.overwrite(defaultExport.start, defaultExport.declaration.start, `const template = `)
      // {
      //   type: 'Property',
      //   start: 42,
      //   end: 90,
      //   method: true,
      //   shorthand: false,
      //   computed: false,
      //   key: Node { type: 'Identifier', start: 42, end: 50, name: 'onrender' },
      //   kind: 'init',
      //   value: Node {
      //     type: 'FunctionExpression',
      //     start: 51,
      //     end: 90,
      //     id: null,
      //     generator: false,
      //     expression: false,
      //     async: false,
      //     params: [],
      //     body: [Node]
      //   }
      // }
      // each property just like above example
      defaultExport.declaration.properties.forEach((prop) => {
        // prop.key.name:函数名，prop.value：函数体的映射
        templateProperties[prop.key.name] = prop.value
      })
    }
  }
  const helpers = {}
  // 如果export{}中有名字为helpers的函数，则进行以下遍历处理，例如文件helpers中
  if (templateProperties.helpers) {
    templateProperties.helpers.properties.forEach((prop) => {
      // 对helpers中的函数名和函数体做映射
      helpers[prop.key.name] = prop.value
    })
  }

  const renderers = []

  const getName = counter()

  // TODO use getName instead of counters
  const counters = {
    if: 0,
    each: 0,
  }

  // TODO (scoped) css

  let current = {
    useAnchor: false,
    name: 'renderMainFragment',
    target: 'target',

    initStatements: [],
    updateStatements: [],
    teardownStatements: [],

    contexts: {},
    indexes: {},

    contextChain: ['root'],
    indexNames: {},
    listNames: {},

    counter: counter(),

    parent: null,
  }

  let usesRefs = false
  // [
  //   {
  //     start: 0,
  //     end: 31,
  //     type: 'Element',
  //     name: 'p',
  //     attributes: [],
  //     children: [ [Object] ]
  //   }
  // ]
  // helpers文件中的parsed.html.children为以上所示
  parsed.html.children.forEach((child) => {
    walkHtml(child, {
      Comment: {
        // do nothing
      },

      Element: {
        enter(node) {
          // refs文件为例，node如下
          // {
          //   start: 0,
          //   end: 25,
          //   type: 'Element',
          //   name: 'canvas',
          //   attributes: [ { start: 8, end: 15, type: 'Ref', name: 'foo' } ],
          //   children: []
          // }
          // 统计name数量，并返回name
          const name = current.counter(node.name)

          const initStatements = [`var ${name} = document.createElement( '${node.name}' );`]

          const updateStatements = []
          const teardownStatements = []

          const allUsedContexts = new Set()

          node.attributes.forEach((attribute) => {
            if (attribute.type === 'Attribute') {
              let metadata = attributeLookup[attribute.name]
              if (metadata && metadata.appliesTo && !~metadata.appliesTo.indexOf(node.name)) metadata = null

              if (attribute.value === true) {
                // attributes without values, e.g. <textarea readonly>
                if (metadata) {
                  initStatements.push(deindent`
										${name}.${metadata.propertyName} = true;
									`)
                } else {
                  initStatements.push(deindent`
										${name}.setAttribute( '${attribute.name}', true );
									`)
                }

                // special case – autofocus. has to be handled in a bit of a weird way
                if (attribute.name === 'autofocus') {
                  current.autofocus = name
                }
              } else if (attribute.value.length === 1) {
                const value = attribute.value[0]

                let result = ''

                if (value.type === 'Text') {
                  // static attributes
                  result = JSON.stringify(value.data)

                  if (metadata) {
                    initStatements.push(deindent`
											${name}.${metadata.propertyName} = ${result};
										`)
                  } else {
                    initStatements.push(deindent`
											${name}.setAttribute( '${attribute.name}', ${result} );
										`)
                  }
                } else {
                  // dynamic – but potentially non-string – attributes
                  contextualise(code, value.expression, current.contexts, current.indexes, helpers)
                  result = `[✂${value.expression.start}-${value.expression.end}✂]`

                  if (metadata) {
                    updateStatements.push(deindent`
											${name}.${metadata.propertyName} = ${result};
										`)
                  } else {
                    updateStatements.push(deindent`
											${name}.setAttribute( '${attribute.name}', ${result} );
										`)
                  }
                }
              } else {
                const value =
                  (attribute.value[0].type === 'Text' ? '' : `"" + `) +
                  attribute.value
                    .map((chunk) => {
                      if (chunk.type === 'Text') {
                        return JSON.stringify(chunk.data)
                      } else {
                        addSourcemapLocations(chunk.expression)

                        contextualise(code, chunk.expression, current.contexts, current.indexes, helpers)
                        return `( [✂${chunk.expression.start}-${chunk.expression.end}✂] )`
                      }
                    })
                    .join(' + ')

                if (metadata) {
                  updateStatements.push(deindent`
										${name}.${metadata.propertyName} = ${value};
									`)
                } else {
                  updateStatements.push(deindent`
										${name}.setAttribute( '${attribute.name}', ${value} );
									`)
                }
              }
            } else if (attribute.type === 'EventHandler') {
              // TODO verify that it's a valid callee (i.e. built-in or declared method)
              addSourcemapLocations(attribute.expression)
              code.insertRight(attribute.expression.start, 'component.')

              const usedContexts = new Set()
              attribute.expression.arguments.forEach((arg) => {
                const contexts = contextualise(code, arg, current.contexts, current.indexes, helpers, true)

                contexts.forEach((context) => {
                  usedContexts.add(context)
                  allUsedContexts.add(context)
                })
              })

              // TODO hoist event handlers? can do `this.__component.method(...)`
              const declarations = [...usedContexts].map((name) => {
                if (name === 'root') return 'var root = this.__svelte.root;'

                const listName = current.listNames[name]
                const indexName = current.indexNames[name]

                return `var ${listName} = this.__svelte.${listName}, ${indexName} = this.__svelte.${indexName}, ${name} = ${listName}[${indexName}]`
              })

              const handlerName = current.counter(`${attribute.name}Handler`)
              const handlerBody =
                (declarations.length ? declarations.join('\n') + '\n\n' : '') + `[✂${attribute.expression.start}-${attribute.expression.end}✂];`

              const customEvent = templateProperties.events && templateProperties.events.properties.find((prop) => prop.key.name === attribute.name)

              if (customEvent) {
                initStatements.push(deindent`
									const ${handlerName} = template.events.${attribute.name}( ${name}, function ( event ) {
										${handlerBody}
									});
								`)

                teardownStatements.push(deindent`
									${handlerName}.teardown();
								`)
              } else {
                initStatements.push(deindent`
									function ${handlerName} ( event ) {
										${handlerBody}
									}

									${name}.addEventListener( '${attribute.name}', ${handlerName}, false );
								`)

                teardownStatements.push(deindent`
									${name}.removeEventListener( '${attribute.name}', ${handlerName}, false );
								`)
              }
            } else if (attribute.type === 'Binding') {
          
              createBinding(node, name, attribute, current, initStatements, updateStatements, teardownStatements, allUsedContexts)
            } else if (attribute.type === 'Ref') {
              usesRefs = true
              // refs文件中，attribute.name='foo',name=node.name='canvas'
              initStatements.push(deindent`
								component.refs.${attribute.name} = ${name};
							`)
              //initStatements: [
              //   "var canvas = document.createElement( 'canvas' );",
              //   'component.refs.foo = canvas;'
              // ]
              teardownStatements.push(deindent`
								component.refs.${attribute.name} = null;
							`)
            } else {
              throw new Error(`Not implemented: ${attribute.type}`)
            }
          })

          if (allUsedContexts.size) {
            initStatements.push(deindent`
							${name}.__svelte = {};
						`)

            const declarations = [...allUsedContexts]
              .map((contextName) => {
                if (contextName === 'root') return `${name}.__svelte.root = root;`

                const listName = current.listNames[contextName]
                const indexName = current.indexNames[contextName]

                return `${name}.__svelte.${listName} = ${listName};\n${name}.__svelte.${indexName} = ${indexName};`
              })
              .join('\n')

            updateStatements.push(declarations)
          }

          teardownStatements.push(`${name}.parentNode.removeChild( ${name} );`)

          current.initStatements.push(initStatements.join('\n'))
          if (updateStatements.length) current.updateStatements.push(updateStatements.join('\n'))
          current.teardownStatements.push(teardownStatements.join('\n'))

          current = Object.assign({}, current, {
            target: name,
            parent: current,
          })
        },

        leave() {
          const name = current.target

          current = current.parent

          if (current.useAnchor && current.target === 'target') {
            current.initStatements.push(deindent`
							anchor.parentNode.insertBefore( ${name}, anchor );
						`)
          } else {
            current.initStatements.push(deindent`
							${current.target}.appendChild( ${name} );
						`)
          }
        },
      }, //Element结束

      Text: {
        enter(node) {
          current.initStatements.push(deindent`
						${current.target}.appendChild( document.createTextNode( ${JSON.stringify(node.data)} ) );
					`)
        },
      },

      MustacheTag: {
        enter(node) {
          const name = current.counter('text')

          current.initStatements.push(deindent`
						var ${name} = document.createTextNode( '' );
						var ${name}_value = '';
						${current.target}.appendChild( ${name} );
					`)

          addSourcemapLocations(node.expression)

          const usedContexts = contextualise(code, node.expression, current.contexts, current.indexes, helpers)
          const snippet = `[✂${node.expression.start}-${node.expression.end}✂]`

          if (isReference(node.expression)) {
            const reference = `${template.slice(node.expression.start, node.expression.end)}`
            const qualified = usedContexts[0] === 'root' ? `root.${reference}` : reference

            current.updateStatements.push(deindent`
							if ( ${snippet} !== ${name}_value ) {
								${name}_value = ${qualified};
								${name}.data = ${name}_value;
							}
						`)
          } else {
            const temp = getName('temp')

            current.updateStatements.push(deindent`
							var ${temp} = ${snippet};
							if ( ${temp} !== ${name}_value ) {
								${name}_value = ${temp};
								${name}.data = ${name}_value;
							}
						`)
          }
        },
      },

      IfBlock: {
        enter(node) {
          const i = counters.if++
          const name = `ifBlock_${i}`
          const renderer = `renderIfBlock_${i}`

          current.initStatements.push(deindent`
						var ${name}_anchor = document.createComment( ${JSON.stringify(`#if ${template.slice(node.expression.start, node.expression.end)}`)} );
						${current.target}.appendChild( ${name}_anchor );
						var ${name} = null;
					`)

          addSourcemapLocations(node.expression)

          const usedContexts = contextualise(code, node.expression, current.contexts, current.indexes, helpers)
          const snippet = `[✂${node.expression.start}-${node.expression.end}✂]`

          let expression

          if (isReference(node.expression)) {
            const reference = `${template.slice(node.expression.start, node.expression.end)}`
            expression = usedContexts[0] === 'root' ? `root.${reference}` : reference

            current.updateStatements.push(deindent`
							if ( ${snippet} && !${name} ) {
								${name} = ${renderer}( component, ${current.target}, ${name}_anchor );
							}
						`)
          } else {
            expression = `${name}_value`

            current.updateStatements.push(deindent`
							var ${expression} = ${snippet};

							if ( ${expression} && !${name} ) {
								${name} = ${renderer}( component, ${current.target}, ${name}_anchor );
							}
						`)
          }

          current.updateStatements.push(deindent`
						else if ( !${expression} && ${name} ) {
							${name}.teardown();
							${name} = null;
						}

						if ( ${name} ) {
							${name}.update( ${current.contextChain.join(', ')} );
						}
					`)

          current.teardownStatements.push(deindent`
						if ( ${name} ) ${name}.teardown();
						${name}_anchor.parentNode.removeChild( ${name}_anchor );
					`)

          current = Object.assign({}, current, {
            useAnchor: true,
            name: renderer,
            target: 'target',

            initStatements: [],
            updateStatements: [],
            teardownStatements: [],

            counter: counter(),

            parent: current,
          })
        },

        leave() {
          renderers.push(createRenderer(current))
          current = current.parent
        },
      },

      EachBlock: {
        enter(node) {
          const i = counters.each++
          const name = `eachBlock_${i}`
          const renderer = `renderEachBlock_${i}`

          const listName = `${name}_value`

          current.initStatements.push(deindent`
						var ${name}_anchor = document.createComment( ${JSON.stringify(`#each ${template.slice(node.expression.start, node.expression.end)}`)} );
						${current.target}.appendChild( ${name}_anchor );
						var ${name}_iterations = [];
						const ${name}_fragment = document.createDocumentFragment();
					`)

          addSourcemapLocations(node.expression)

          contextualise(code, node.expression, current.contexts, current.indexes, helpers)
          const snippet = `[✂${node.expression.start}-${node.expression.end}✂]`

          current.updateStatements.push(deindent`
						var ${name}_value = ${snippet};

						for ( var i = 0; i < ${name}_value.length; i += 1 ) {
							if ( !${name}_iterations[i] ) {
								${name}_iterations[i] = ${renderer}( component, ${name}_fragment );
							}

							const iteration = ${name}_iterations[i];
							${name}_iterations[i].update( ${current.contextChain.join(', ')}, ${listName}, ${listName}[i], i );
						}

						for ( var i = ${name}_value.length; i < ${name}_iterations.length; i += 1 ) {
							${name}_iterations[i].teardown();
						}

						${name}_anchor.parentNode.insertBefore( ${name}_fragment, ${name}_anchor );
						${name}_iterations.length = ${listName}.length;
					`)

          current.teardownStatements.push(deindent`
						for ( let i = 0; i < ${name}_iterations.length; i += 1 ) {
							${name}_iterations[i].teardown();
						}

						${name}_anchor.parentNode.removeChild( ${name}_anchor );
					`)

          const indexNames = Object.assign({}, current.indexNames)
          const indexName = (indexNames[node.context] = node.index || `${node.context}__index`)

          const listNames = Object.assign({}, current.listNames)
          listNames[node.context] = listName

          const contexts = Object.assign({}, current.contexts)
          contexts[node.context] = true

          const indexes = Object.assign({}, current.indexes)
          if (node.index) indexes[indexName] = node.context

          const contextChain = current.contextChain.concat(listName, node.context, indexName)

          current = {
            useAnchor: false,
            name: renderer,
            target: 'target',
            expression: node.expression,
            context: node.context,

            contexts,
            indexes,

            indexNames,
            listNames,
            contextChain,

            initStatements: [],
            updateStatements: [
              Object.keys(contexts)
                .map((contextName) => {
                  const listName = listNames[contextName]
                  const indexName = indexNames[contextName]

                  return `var ${contextName} = ${listName}[${indexName}];`
                })
                .join('\n'),
            ],
            teardownStatements: [],

            counter: counter(),

            parent: current,
          }
        },

        leave() {
          renderers.push(createRenderer(current))

          current = current.parent
        },
      },
    })
  })

  renderers.push(createRenderer(current))

  const setStatements = [
    deindent`
		const oldState = state;
		state = Object.assign( {}, oldState, newState );
	`,
  ]

  if (templateProperties.computed) {
    const dependencies = new Map()

    templateProperties.computed.properties.forEach((prop) => {
      const key = prop.key.name
      const value = prop.value

      const deps = value.params.map((param) => param.name)
      dependencies.set(key, deps)
    })

    const visited = new Set()

    function visit(key) {
      if (!dependencies.has(key)) return // not a computation

      if (visited.has(key)) return
      visited.add(key)

      const deps = dependencies.get(key)
      deps.forEach(visit)

      setStatements.push(deindent`
				if ( ${deps.map((dep) => `( '${dep}' in newState && typeof state.${dep} === 'object' || state.${dep} !== oldState.${dep} )`).join(' || ')} ) {
					state.${key} = newState.${key} = template.computed.${key}( ${deps.map((dep) => `state.${dep}`).join(', ')} );
				}
			`)
    }

    templateProperties.computed.properties.forEach((prop) => visit(prop.key.name))
  }

  setStatements.push(deindent`
		dispatchObservers( observers.immediate, newState, oldState );
		mainFragment.update( state );
		dispatchObservers( observers.deferred, newState, oldState );
	`)

  const result = deindent`
		${parsed.js ? `[✂${parsed.js.content.start}-${parsed.js.content.end}✂]` : ``}

		${renderers.reverse().join('\n\n')}

		export default function createComponent ( options ) {
			var component = ${templateProperties.methods ? `Object.create( template.methods )` : `{}`};${usesRefs ? `\ncomponent.refs = {}` : ``}
			var state = {};

			var observers = {
				immediate: Object.create( null ),
				deferred: Object.create( null )
			};

			function dispatchObservers ( group, newState, oldState ) {
				for ( const key in group ) {
					if ( !( key in newState ) ) continue;

					const newValue = newState[ key ];
					const oldValue = oldState[ key ];

					if ( newValue === oldValue && typeof newValue !== 'object' ) continue;

					const callbacks = group[ key ];
					if ( !callbacks ) continue;

					for ( let i = 0; i < callbacks.length; i += 1 ) {
						callbacks[i].call( component, newValue, oldValue );
					}
				}
			}

			component.get = function get ( key ) {
				return state[ key ];
			};

			component.set = function set ( newState ) {
				${setStatements.join('\n\n')}
			};

			component.observe = function ( key, callback, options = {} ) {
				const group = options.defer ? observers.deferred : observers.immediate;

				( group[ key ] || ( group[ key ] = [] ) ).push( callback );
				if ( options.init !== false ) callback( state[ key ] );

				return {
					cancel () {
						const index = group[ key ].indexOf( callback );
						if ( ~index ) group[ key ].splice( index, 1 );
					}
				};
			};

			component.teardown = function teardown () {
				mainFragment.teardown();
				mainFragment = null;

				state = {};

				${templateProperties.onteardown ? `template.onteardown.call( component );` : ``}
			};

			let mainFragment = renderMainFragment( component, options.target );
			component.set( ${templateProperties.data ? `Object.assign( template.data(), options.data )` : `options.data`} );

			${templateProperties.onrender ? `template.onrender.call( component );` : ``}

			return component;
		}
	`

  const pattern = /\[✂(\d+)-(\d+)$/

  const parts = result.split('✂]')
  const finalChunk = parts.pop()

  const sortedByResult = parts.map((str, index) => {
    const match = pattern.exec(str)

    return {
      index,
      chunk: str.replace(pattern, ''),
      start: +match[1],
      end: +match[2],
    }
  })

  const sortedBySource = sortedByResult.slice().sort((a, b) => a.start - b.start)

  let c = 0

  sortedBySource.forEach((part) => {
    code.remove(c, part.start)
    code.insertRight(part.start, part.chunk)
    c = part.end
  })

  code.remove(c, template.length)
  code.append(finalChunk)

  sortedByResult.forEach((part) => {
    code.move(part.start, part.end, 0)
  })

  return {
    code: code.toString(),
    map: code.generateMap(),
  }
}
