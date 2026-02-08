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

const PORT = process.env.PORT || process.env.GUN_PORT || 8765;

const server = http.createServer(Gun.serve);

const gun = Gun({
  web: server.listen(PORT),
  localStorage: false,
  radisk: false,
});

console.log(`🔫 GunDB relay server running on http://localhost:${PORT}/gun`);
console.log(`   WebSocket: ws://localhost:${PORT}/gun`);

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
