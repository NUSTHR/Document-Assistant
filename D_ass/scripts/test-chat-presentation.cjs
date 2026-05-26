const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const ts = require('typescript')

const projectRoot = path.resolve(__dirname, '..')

require.extensions['.ts'] = function compileTypeScriptModule(module, filename) {
  const source = fs.readFileSync(filename, 'utf8')
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      strict: true,
    },
    fileName: filename,
  })
  module._compile(output.outputText, filename)
}

const originalResolveFilename = Module._resolveFilename
Module._resolveFilename = function resolveExtensionlessTypeScript(request, parent, isMain, options) {
  if (request.startsWith('.') && parent?.filename) {
    const resolved = path.resolve(path.dirname(parent.filename), request)
    if (!path.extname(resolved) && fs.existsSync(`${resolved}.ts`)) {
      return `${resolved}.ts`
    }
  }

  return originalResolveFilename.call(this, request, parent, isMain, options)
}

const {
  contentsAreEquivalent,
  normalizeAnswerForAction,
  normalizeComparableMessage,
  splitThoughtContent,
} = require(path.join(projectRoot, 'src/lib/chat-presentation.ts'))

assert.deepEqual(splitThoughtContent('<think>working</think>Final answer'), {
  thought: 'working',
  answer: 'Final answer',
  hasThought: true,
})

assert.deepEqual(splitThoughtContent('<think>still thinking'), {
  thought: 'still thinking',
  answer: '',
  hasThought: true,
})

assert.deepEqual(splitThoughtContent('Plain answer'), {
  thought: '',
  answer: 'Plain answer',
  hasThought: false,
})

assert.equal(normalizeAnswerForAction('<think>hidden</think>Copy me'), 'Copy me')
assert.equal(normalizeComparableMessage('**ERROR**: <think>x</think>Actual'), 'Actual')
assert.equal(contentsAreEquivalent('Short answer', 'Short answer'), true)
assert.equal(contentsAreEquivalent('Short answer', 'Different'), false)
assert.equal(
  contentsAreEquivalent(
    'A'.repeat(100),
    `${'A'.repeat(100)} with additional persisted metadata`,
  ),
  true,
)

console.log('chat presentation tests passed')
