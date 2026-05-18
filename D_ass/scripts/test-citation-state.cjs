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
  parseTranscriptMessageIndex,
  resolveActiveCitationMessageId,
  resolveDisplayedSourceItems,
} = require(path.join(projectRoot, 'src/lib/citation-state.ts'))
const {
  normalizeSourceItems,
} = require(path.join(projectRoot, 'src/lib/citation-sources.ts'))

function reference(number) {
  return {
    biz_file_id: `file-${number}`,
    biz_file_name: `file-${number}.pdf`,
    chunk_content: `chunk ${number}`,
    reference_number: number,
    similarity_score: 0.9,
  }
}

const session = {
  biz_session_id: 'session_a',
  name: 'Audit',
  biz_chat_id: 'chat_a',
  messages: [
    { role: 'assistant', content: 'Hi', references: [] },
    { role: 'user', content: 'Question one', references: [] },
    { role: 'assistant', content: 'Answer one [^0] [^1]', references: [reference(0), reference(1)] },
    { role: 'user', content: 'Question two', references: [] },
    { role: 'assistant', content: 'Answer two [^2]', references: [reference(0), reference(1), reference(2)] },
  ],
}

assert.equal(parseTranscriptMessageIndex(session, 'session_a-2'), 2)
assert.equal(parseTranscriptMessageIndex(session, 'session_b-2'), null)
assert.equal(parseTranscriptMessageIndex(session, 'session_a-99'), null)
assert.equal(resolveActiveCitationMessageId(session, 'session_a-2'), 'session_a-2')
assert.equal(resolveActiveCitationMessageId(session, 'session_b-2'), 'session_a-4')

const noDisplayableReferences = {
  ...session,
  messages: [
    { role: 'assistant', content: 'Hi', references: [] },
    { role: 'user', content: 'Question', references: [] },
    { role: 'assistant', content: 'Answer without citations', references: [reference(0)] },
  ],
}

assert.equal(resolveActiveCitationMessageId(noDisplayableReferences, ''), '')

assert.deepEqual(
  normalizeSourceItems([
    {
      id: 'two-a',
      label: 'REF [2]',
      score: '90% Match',
      title: 'b',
      content: 'b',
      fullContent: 'b',
      sourceName: 'b',
      referenceNumber: 2,
      isLiveReference: false,
    },
    {
      id: 'zero',
      label: 'REF [0]',
      score: '90% Match',
      title: 'a',
      content: 'a',
      fullContent: 'a',
      sourceName: 'a',
      referenceNumber: 0,
      isLiveReference: false,
    },
    {
      id: 'two-b',
      label: 'REF [2]',
      score: '88% Match',
      title: 'b2',
      content: 'b2',
      fullContent: 'b2',
      sourceName: 'b2',
      referenceNumber: 2,
      isLiveReference: false,
    },
  ]).map((source) => source.referenceNumber),
  [0, 2],
)

const sourceZero = {
  id: 'zero',
  label: 'REF [0]',
  score: '90% Match',
  title: 'zero.pdf',
  content: 'zero',
  fullContent: 'zero',
  sourceName: 'zero.pdf',
  referenceNumber: 0,
  isLiveReference: false,
}
const sourceTwo = {
  id: 'two',
  label: 'REF [2]',
  score: '90% Match',
  title: 'two.pdf',
  content: 'two',
  fullContent: 'two',
  sourceName: 'two.pdf',
  referenceNumber: 2,
  isLiveReference: false,
}

const citationMessages = [
  {
    id: 'session_a-2',
    role: 'assistant',
    references: [reference(0)],
    referenceNumbers: [0],
    citedReferenceNumbers: [0],
  },
  {
    id: 'session_a-4',
    role: 'assistant',
    references: [reference(0), reference(1), reference(2)],
    referenceNumbers: [0, 1, 2],
    citedReferenceNumbers: [],
  },
]

assert.deepEqual(
  resolveDisplayedSourceItems({
    activeCitationMessageId: '',
    hasLiveReferenceState: false,
    liveSourceItems: [],
    messages: citationMessages,
    readLatestSnapshot: () => [sourceTwo],
    readSnapshot: () => [],
    sessionId: 'session_a',
  }).map((source) => source.referenceNumber),
  [0],
)

assert.deepEqual(
  resolveDisplayedSourceItems({
    activeCitationMessageId: 'session_a-4',
    hasLiveReferenceState: false,
    liveSourceItems: [],
    messages: citationMessages,
    readLatestSnapshot: () => [sourceZero],
    readSnapshot: () => [sourceTwo],
    sessionId: 'session_a',
  }).map((source) => source.referenceNumber),
  [2],
)

assert.deepEqual(
  resolveDisplayedSourceItems({
    activeCitationMessageId: 'session_a-2',
    hasLiveReferenceState: true,
    liveSourceItems: [sourceTwo],
    messages: citationMessages,
    readLatestSnapshot: () => [sourceZero],
    readSnapshot: () => [sourceZero],
    sessionId: 'session_a',
  }).map((source) => source.referenceNumber),
  [2],
)

console.log('citation state tests passed')
