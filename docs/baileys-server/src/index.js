// Polyfill for crypto - required by Baileys in Node.js 18+
const crypto = require('crypto');
if (!globalThis.crypto) {
  globalThis.crypto = crypto.webcrypto;
}

const express = require('express');
const cors = require('cors');
const { WebSocketServer } = require('ws');
const http = require('http');
const { instanceManager } = require('./instanceManager');
const routes = require('./routes');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// Middleware
app.use(cors());
app.use(express.json());

// Store WebSocket connections by instance ID
const wsConnections = new Map();

wss.on('connection', (ws, req) => {
  const instanceId = new URL(req.url, 'http://localhost').searchParams.get('instanceId');
  
  if (instanceId) {
    wsConnections.set(instanceId, ws);
    console.log(`WebSocket connected for instance: ${instanceId}`);
    
    ws.on('close', () => {
      wsConnections.delete(instanceId);
      console.log(`WebSocket disconnected for instance: ${instanceId}`);
    });
  }
});

// Make wsConnections available to routes
app.set('wsConnections', wsConnections);
app.set('instanceManager', instanceManager);

// Routes
app.use('/api/v1', routes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`🚀 Servidor Baileys rodando na porta ${PORT}`);
  console.log(`📡 WebSocket disponível em ws://localhost:${PORT}/ws`);
});
