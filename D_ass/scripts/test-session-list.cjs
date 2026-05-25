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
  createDraftSession,
  DRAFT_SESSION_ID,
  DRAFT_SESSION_NAME,
  isDraftSessionId,
  upsertSessionSummary,
} = require(path.join(projectRoot, 'src/lib/session-list.ts'))

const draftSession = createDraftSession('chat_a')

assert.equal(draftSession.biz_session_id, DRAFT_SESSION_ID)
assert.equal(draftSession.name, DRAFT_SESSION_NAME)
assert.equal(draftSession.biz_chat_id, 'chat_a')
assert.deepEqual(draftSession.messages, [])
assert.equal(isDraftSessionId(DRAFT_SESSION_ID), true)
assert.equal(isDraftSessionId('session_real'), false)

const existingSessions = [
  {
    biz_session_id: 'session_old',
    name: 'Old',
    biz_chat_id: 'chat_a',
    messages: [{ role: 'user', content: 'old question', references: [] }],
  },
]

const withNewSession = upsertSessionSummary(existingSessions, {
  bizChatId: 'chat_a',
  bizSessionId: 'session_new',
  name: 'First question',
})

assert.deepEqual(
  withNewSession.map((session) => session.biz_session_id),
  ['session_new', 'session_old'],
)
assert.equal(withNewSession[0].name, 'First question')
assert.deepEqual(withNewSession[0].messages, [])
assert.equal(existingSessions.length, 1)

const withUpdatedSession = upsertSessionSummary(withNewSession, {
  bizChatId: 'chat_a',
  bizSessionId: 'session_old',
  name: 'Renamed old',
})

assert.deepEqual(
  withUpdatedSession.map((session) => session.biz_session_id),
  ['session_old', 'session_new'],
)
assert.equal(withUpdatedSession[0].name, 'Renamed old')
assert.deepEqual(
  withUpdatedSession[0].messages,
  [{ role: 'user', content: 'old question', references: [] }],
)
assert.equal(
  upsertSessionSummary(existingSessions, {
    bizChatId: 'chat_a',
    bizSessionId: '   ',
    name: 'Ignored',
  }),
  existingSessions,
)

console.log('session list tests passed')
