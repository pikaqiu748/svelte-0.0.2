// import { compile } from '../dist/svelte.es.js'
import { compile } from '../compiler/index.js'
import parse from '../compiler/parse/index.js'
import * as assert from 'assert'
import * as path from 'path'
import * as fs from 'fs'
import jsdom from 'jsdom'

const cache = {}

require.extensions['.svelte'] = function (module, filename) {
  const code = cache[filename]
  if (!code) throw new Error(`not compiled: ${filename}`)

  return module._compile(code, filename)
}

function exists(path) {
  try {
    fs.statSync(path)
    return true
  } catch (err) {
    return false
  }
}

// 首先我们可以看到mocha主要提供两个核心西数 describe 和 i来进行测试用例的编写。describe函数我们称之为测试套件，它
// 的核心功能是来描述测试的流程，it函数我们称之为一个测试单元，它的功能是来执行具体的测试用例。
describe('svelte', () => {
  describe('parser', () => {
    // 返回一个包含该目录下的所有文件夹名的数组
    fs.readdirSync('test/parser').forEach((dir) => {
      if (dir[0] === '.') return
      // 判断solo文件是否存在
      const solo = exists(`test/parser/${dir}/solo`)
      ;(solo ? it.only : it)(dir, () => {
        // read file's content
        const input = fs.readFileSync(`test/parser/${dir}/input.svelte`, 'utf-8').trim()
        // parse content
        const actual = parse(input)
        const expected = require(`./parser/${dir}/output.json`)

        assert.deepEqual(actual, expected)
      })
    })
  })

  describe('compiler', () => {
    function loadConfig(dir) {
      try {
        // 获取默认导出信息
        return require(`./compiler/${dir}/_config.js`).default
      } catch (err) {
        if (err.code === 'E_NOT_FOUND') {
          return {}
        }

        throw err
      }
    }

    function env() {
      return new Promise((fulfil, reject) => {
        jsdom.env('<main></main>', (err, window) => {
          if (err) {
            reject(err)
          } else {
            global.document = window.document
            fulfil(window)
          }
        })
      })
    }

    fs.readdirSync('test/compiler').forEach((dir) => {
      if (dir[0] === '.') return
      // 返回默认导出信息
      const config = loadConfig(dir)

      ;(config.solo ? it.only : it)(dir, () => {
        let compiled

        try {
          // 读取文件内容,字符串形式
          const source = fs.readFileSync(`test/compiler/${dir}/main.svelte`, 'utf-8')
          // 进行编译
          compiled = compile(source)
        } catch (err) {
          if (config.compileError) {
            config.compileError(err)
            return
          } else {
            throw err
          }
        }
        // 获取编译后的code
        const { code } = compiled
        const withLineNumbers = code
          .split('\n')
          .map((line, i) => {
            i = String(i + 1)
            while (i.length < 3) i = ` ${i}`
            return `${i}: ${line.replace(/^\t+/, (match) => match.split('\t').join('    '))}`
          })
          .join('\n')
        //  path.resolve(param),返回param的绝对路径，
        // 例如/Users/lihui/Desktop/svelte-0.0.2/test/compiler/event-handler-removal/main.svelte
        // 对编译后的代码进行缓存
        cache[path.resolve(`test/compiler/${dir}/main.svelte`)] = code

        let factory

        try {
          // 经过编译后，每个文件都有export default createComponent(options)
          factory = require(`./compiler/${dir}/main.svelte`).default
        } catch (err) {
          console.log(withLineNumbers) // eslint-disable-line no-console
          throw err
        }

        if (config.show) {
          console.log(withLineNumbers) // eslint-disable-line no-console
        }

        return env()
          .then((window) => {
            const target = window.document.querySelector('main')
            // 经过编译后，每个文件都有export default createComponent(options)
            const component = factory({
              target,
              data: config.data,
            })
            // 返回的component:
            // {
            // 	get: [Function: get],
            // 	set: [Function: set],
            // 	observe: [Function (anonymous)],
            // 	teardown: [Function: teardown],
            // 	events: [ 'render' ]
            //   }
            if (config.html) {
              assert.equal(target.innerHTML, config.html)
            }

            if (config.test) {
              config.test(component, target, window)
            } else {
              component.teardown()
              assert.equal(target.innerHTML, '')
            }
          })
          .catch((err) => {
            if (!config.show) console.log(withLineNumbers) // eslint-disable-line no-console
            throw err
          })
      })
    })
  })
})
