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
  isUnavailableChatError,
} = require(path.join(projectRoot, 'src/lib/ragflow-chat-state.ts'))

assert.equal(isUnavailableChatError('', 'RAGFLOW_CHAT_UNAVAILABLE'), true)
assert.equal(isUnavailableChatError('chat resource was not found'), true)
assert.equal(isUnavailableChatError('The selected chat assistant is no longer available.'), true)
assert.equal(isUnavailableChatError('No RAGFlow chat assistant is available.'), true)
assert.equal(isUnavailableChatError('Network error. Check whether the service is running.'), false)
assert.equal(isUnavailableChatError('missing RAGFlow authorization'), false)

console.log('ragflow chat state tests passed')
