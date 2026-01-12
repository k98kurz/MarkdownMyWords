/**
 * GunDB Relay Server
 *
 * Simple relay server for GunDB development.
 * Runs on port 8765 to match the default configuration.
 */

const Gun = require('gun');
const http = require('http');

const server = http.createServer();
const gun = Gun({ web: server });

const PORT = process.env.GUN_PORT || 8765;

server.listen(PORT, () => {
  console.log(`🔫 GunDB relay server running on http://localhost:${PORT}/gun`);
  console.log(`   WebSocket: ws://localhost:${PORT}/gun`);
});

// Handle server errors
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use.`);
    console.error(`   Another GunDB relay might be running, or you can set GUN_PORT environment variable.`);
  } else {
    console.error('❌ GunDB relay server error:', error);
  }
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down GunDB relay server...');
  server.close(() => {
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down GunDB relay server...');
  server.close(() => {
    process.exit(0);
  });
});
