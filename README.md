# Svelte

Coming soon...



# build时，要在package.json中添加type:'module"才能成功。
# 当引入dist包下的文件时，sudo tnpm run test时，要去掉上句话。


# test/compiler/hello-world，经过初步解析后，如下所示：

# <h1>Hello {{name}}!</h1>


after parser: [
  {
    start: 0,
    end: 24,
    type: 'Element',
    name: 'h1',
    attributes: [],
    children: [ [Object], [Object], [Object] ]
  },
  { start: 24, end: 25, type: 'Text', data: '\n' }
]
after parser: [
  { start: 4, end: 10, type: 'Text', data: 'Hello ' },
  {
    start: 10,
    end: 18,
    type: 'MustacheTag',
    expression: Node { type: 'Identifier', start: 12, end: 16, name: 'name' }
  },
  { start: 18, end: 19, type: 'Text', data: '!' }
]