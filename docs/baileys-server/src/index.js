// Polyfill for crypto - required by Baileys in Node.js 18+
const crypto = require('crypto');
if (!globalThis.crypto) {
  globalThis.crypto = crypto.webcrypto;
}

const express = require('express');
const cors = require('cors');
const { WebSocketServer } = require('ws');
const http = require('http');
const instanceManager = require('./instanceManager');
const routes = require('./routes');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// Middleware
app.use(cors());
app.use(express.json());

wss.on('connection', (ws, req) => {
  const instanceId = new URL(req.url, 'http://localhost').searchParams.get('instanceId');
  
  if (instanceId) {
    // Register WebSocket client in instanceManager so notifications work
    instanceManager.registerWebSocket(instanceId, ws);
    console.log(`WebSocket connected for instance: ${instanceId}`);
    
    // Send current QR code if available
    const qrCode = instanceManager.getQRCode(instanceId);
    if (qrCode) {
      console.log(`[${instanceId}] Sending existing QR code to new WebSocket client`);
      ws.send(JSON.stringify({ type: 'qr', qrCode }));
    }
    
    // Send current status
    const instance = instanceManager.getInstance(instanceId);
    if (instance) {
      console.log(`[${instanceId}] Sending current status to new WebSocket client: ${instance.status}`);
      ws.send(JSON.stringify({ 
        type: 'status', 
        status: instance.status,
        phone: instance.phone 
      }));
    }
    
    ws.on('close', () => {
      instanceManager.unregisterWebSocket(instanceId, ws);
      console.log(`WebSocket disconnected for instance: ${instanceId}`);
    });
    
    ws.on('error', (error) => {
      console.log(`WebSocket error for instance ${instanceId}:`, error.message);
    });
  } else {
    console.log('WebSocket connection without instanceId, closing...');
    ws.close();
  }
});

// Make instanceManager available to routes
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
