/**
 * GunDB Relay Server
 *
 * Simple relay server for GunDB development.
 * Runs on port 8765 to match the default configuration.
 *
 * Railway-compatible with health check endpoint to prevent SIGTERM.
 */

import Gun from 'gun';
import http from 'http';

const SHUTDOWN_TIMEOUT = 2000;

const server = http.createServer();
const gun = Gun({
  web: server,
  localStorage: false,
  radisk: false,
});

// Add HTTP health check endpoint for Railway health probes
// This prevents Railway from sending SIGTERM due to failed health checks
server.on('request', (req, res) => {
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
    return;
  }
});

const PORT = process.env.GUN_PORT || 8765;

server.listen(PORT, () => {
  console.log(`🔫 GunDB relay server running on http://localhost:${PORT}/gun`);
  console.log(`   WebSocket: ws://localhost:${PORT}/gun`);
  console.log(`   Health check: http://localhost:${PORT}/health`);
});

// Handle server errors
server.on('error', error => {
  if (error.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use.`);
    console.error(
      `   Another GunDB relay might be running, or you can set GUN_PORT environment variable.`
    );
  } else {
    console.error('❌ GunDB relay server error:', error);
  }
  process.exit(1);
});

// Graceful shutdown
function handleShutdown(signal) {
  console.log(`\n🛑 Shutting down GunDB relay server (${signal})...`);

  const timeoutId = setTimeout(() => {
    console.error('⚠️  Graceful shutdown timed out, forcing exit...');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT);

  server.close(() => {
    clearTimeout(timeoutId);
    console.log('✓ GunDB relay server shut down gracefully');
    process.exit(0);
  });
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));
