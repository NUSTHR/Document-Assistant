const { execFileSync } = require('node:child_process')
const path = require('node:path')

const repositoryRoot = path.resolve(__dirname, '..', '..')

const trackedFiles = execFileSync('git', ['ls-files', '-z'], {
  cwd: repositoryRoot,
  encoding: 'utf8',
})
  .split('\0')
  .filter(Boolean)

const disallowedPatterns = [
  /(^|\/)__pycache__\//,
  /\.pyc$/,
  /^chat-request.*\.json$/,
  /^sample-embedding-verify.*\.txt$/,
  /^diary\.txt$/,
  /(^|\/)[^/]+\.egg-info\//,
  /(^|\/)\.venv\//,
  /(^|\/)node_modules\//,
  /(^|\/)dist\//,
  /\.log$/,
]

const violations = trackedFiles.filter((filePath) =>
  disallowedPatterns.some((pattern) => pattern.test(filePath.replaceAll('\\', '/'))),
)

if (violations.length > 0) {
  console.error('Repository hygiene check failed. Remove these generated/local files from Git:')
  for (const violation of violations) {
    console.error(`- ${violation}`)
  }
  process.exit(1)
}

console.log('repository hygiene check passed')
