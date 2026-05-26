const http = require('http')
const fs = require('fs')
const path = require('path')
const { pathToFileURL } = require('url')

const root = path.join(__dirname, 'dist')
const port = 5173
const proxyTarget = 'http://127.0.0.1:8081'
const mediaTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.ico', 'image/x-icon'],
])

function sendFile(response, filePath) {
  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(404)
      response.end('Not found')
      return
    }

    response.writeHead(200, {
      'Content-Type': mediaTypes.get(path.extname(filePath).toLowerCase()) || 'application/octet-stream',
      'Cache-Control': 'no-store',
    })
    response.end(content)
  })
}

function proxy(request, response) {
  const target = new URL(request.url, proxyTarget)
  const proxyRequest = http.request(target, {
    method: request.method,
    headers: {
      ...request.headers,
      host: target.host,
    },
  }, (proxyResponse) => {
    response.writeHead(proxyResponse.statusCode || 502, proxyResponse.headers)
    proxyResponse.pipe(response)
  })
  proxyRequest.on('error', () => {
    response.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' })
    response.end('Integration service unavailable')
  })
  request.pipe(proxyRequest)
}

http.createServer((request, response) => {
  const requestUrl = new URL(request.url, 'http://127.0.0.1')
  if (requestUrl.pathname === '/health' || requestUrl.pathname.startsWith('/api/')) {
    proxy(request, response)
    return
  }

  const requestedPath = decodeURIComponent(requestUrl.pathname)
  const normalizedPath = path.normalize(requestedPath).replace(/^([/\\])+/, '')
  let filePath = path.join(root, normalizedPath)
  if (!filePath.startsWith(root)) {
    response.writeHead(403)
    response.end('Forbidden')
    return
  }

  if (!path.extname(filePath)) {
    filePath = path.join(root, 'index.html')
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(root, 'index.html')
  }
  sendFile(response, filePath)
}).listen(port, '0.0.0.0', () => {
  console.log(`Documentation Assistant static server: http://127.0.0.1:${port}`)
  console.log(`Serving ${pathToFileURL(root)}`)
})
