import Holster from '@mblaney/holster/src/holster.js'
import http from 'http'

const SHUTDOWN_TIMEOUT = 2000

const PORT = process.env.GUN_PORT || 8765

const server = http.createServer()
Holster({ server, indexedDB: false })

server.listen(PORT, () => {
  console.log(`Holster relay on ws://localhost:${PORT}`)
})

server.on('error', error => {
  if (error.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use.`)
    console.error(
      `   Another Holster relay might be running, or you can set GUN_PORT environment variable.`
    )
  } else {
    console.error('❌ Holster relay server error:', error)
  }
  process.exit(1)
})

function handleShutdown(signal) {
  console.log(`\n🛑 Shutting down Holster relay server (${signal})...`)

  const timeoutId = setTimeout(() => {
    console.error('⚠️  Graceful shutdown timed out, forcing exit...')
    process.exit(1)
  }, SHUTDOWN_TIMEOUT)

  server.close(() => {
    clearTimeout(timeoutId)
    console.log('✓ Holster relay server shut down gracefully')
    process.exit(0)
  })
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'))
process.on('SIGINT', () => handleShutdown('SIGINT'))