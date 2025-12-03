const makeWASocket = require('@whiskeysockets/baileys').default;
const { 
  DisconnectReason, 
  useMultiFileAuthState,
  Browsers
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');

const logger = pino({ level: 'silent' });
// Stable version recommended by Baileys maintainers - DO NOT use fetchLatestBaileysVersion
const STABLE_VERSION = [2, 3000, 1015901307];

class InstanceManager {
  constructor() {
    this.instances = new Map();
    this.sessionsPath = path.join(__dirname, '../sessions');
    this.instancesFile = path.join(__dirname, '../instances.json');
    this.wsClients = new Map();
    
    if (!fs.existsSync(this.sessionsPath)) {
      fs.mkdirSync(this.sessionsPath, { recursive: true });
    }
    
    this.loadSavedInstances();
  }

  saveInstancesToFile() {
    const instancesData = [];
    for (const [id, instance] of this.instances) {
      instancesData.push({
        id,
        name: instance.name,
        webhookUrl: instance.webhookUrl,
        createdAt: instance.createdAt
      });
    }
    try {
      fs.writeFileSync(this.instancesFile, JSON.stringify(instancesData, null, 2));
      console.log(`Saved ${instancesData.length} instances to file`);
    } catch (error) {
      console.error('Error saving instances to file:', error);
    }
  }

  async loadSavedInstances() {
    if (!fs.existsSync(this.instancesFile)) {
      console.log('No saved instances file found');
      return;
    }

    try {
      const data = fs.readFileSync(this.instancesFile, 'utf8');
      const instancesData = JSON.parse(data);
      console.log(`Found ${instancesData.length} saved instances, recreating...`);
      
      for (const inst of instancesData) {
        console.log(`Recreating instance ${inst.id} (${inst.name})...`);
        await this.createInstance(inst.id, inst.name, inst.webhookUrl);
      }
    } catch (error) {
      console.error('Error loading saved instances:', error);
    }
  }

  registerWebSocket(instanceId, ws) {
    if (!this.wsClients.has(instanceId)) {
      this.wsClients.set(instanceId, new Set());
    }
    this.wsClients.get(instanceId).add(ws);
    console.log(`[${instanceId}] WebSocket client registered`);
  }

  unregisterWebSocket(instanceId, ws) {
    if (this.wsClients.has(instanceId)) {
      this.wsClients.get(instanceId).delete(ws);
      console.log(`[${instanceId}] WebSocket client unregistered`);
    }
  }

  notifyWebSocket(instanceId, data) {
    const clients = this.wsClients.get(instanceId);
    if (clients && clients.size > 0) {
      const message = JSON.stringify(data);
      clients.forEach(ws => {
        try {
          if (ws.readyState === 1) {
            ws.send(message);
          }
        } catch (e) {
          console.log(`[${instanceId}] Error sending to WebSocket:`, e.message);
        }
      });
      console.log(`[${instanceId}] Notified ${clients.size} WebSocket clients`);
    } else {
      console.log(`[${instanceId}] No WebSocket clients to notify`);
    }
  }

  // Helper to get clean instance data (without socket)
  getCleanInstanceData(instance) {
    return {
      id: instance.id,
      name: instance.name,
      status: instance.status,
      phone: instance.phone,
      webhookUrl: instance.webhookUrl,
      createdAt: instance.createdAt,
      qrCode: instance.qrCode
    };
  }

  async createInstance(instanceId, name, webhookUrl = null) {
    // Close existing socket if any
    if (this.instances.has(instanceId)) {
      const existing = this.instances.get(instanceId);
      if (existing.socket) {
        console.log(`[${instanceId}] Closing existing socket`);
        try {
          existing.socket.ev.removeAllListeners();
          existing.socket.end();
        } catch (e) {}
      }
      this.instances.delete(instanceId);
    }

    console.log(`[${instanceId}] Creating instance: ${name}`);
    
    const sessionPath = path.join(this.sessionsPath, instanceId);
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    
    const instance = {
      id: instanceId,
      name,
      webhookUrl,
      status: 'connecting',
      qrCode: null,
      phone: null,
      socket: null,
      createdAt: new Date()
    };

    this.instances.set(instanceId, instance);
    this.saveInstancesToFile();

    try {
      console.log(`[${instanceId}] Creating Baileys socket (v${STABLE_VERSION.join('.')})`);

      const socket = makeWASocket({
        logger,
        printQRInTerminal: true,
        auth: state,
        browser: Browsers.ubuntu('Chrome'),
        version: STABLE_VERSION
      });

      instance.socket = socket;

      socket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        console.log(`[${instanceId}] Connection update:`, JSON.stringify(update));

        if (qr) {
          console.log(`[${instanceId}] QR code received`);
          instance.status = 'qr_pending';
          instance.qrCode = await QRCode.toDataURL(qr);
          this.notifyWebSocket(instanceId, {
            type: 'qr',
            qrCode: instance.qrCode
          });
        }

        if (connection === 'close') {
          const statusCode = lastDisconnect?.error?.output?.statusCode;
          console.log(`[${instanceId}] Connection closed, statusCode: ${statusCode}`);
          
          // Handle different disconnect reasons
          if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
            console.log(`[${instanceId}] Logged out - deleting session`);
            instance.status = 'disconnected';
            instance.qrCode = null;
            instance.phone = null;
            
            // Delete session files
            if (fs.existsSync(sessionPath)) {
              fs.rmSync(sessionPath, { recursive: true });
            }
            
            this.notifyWebSocket(instanceId, {
              type: 'status',
              status: 'disconnected'
            });
          } else if (statusCode === 515 || statusCode === 428) {
            // Stream error or precondition - reconnect
            console.log(`[${instanceId}] Stream error ${statusCode} - reconnecting in 3s...`);
            setTimeout(() => {
              this.reconnectInstance(instanceId);
            }, 3000);
          } else {
            // Other errors - try to reconnect
            console.log(`[${instanceId}] Unknown error - reconnecting in 5s...`);
            instance.status = 'disconnected';
            this.notifyWebSocket(instanceId, {
              type: 'status',
              status: 'disconnected'
            });
            setTimeout(() => {
              this.reconnectInstance(instanceId);
            }, 5000);
          }
        }

        if (connection === 'open') {
          const phone = socket.user?.id?.split(':')[0] || null;
          console.log(`[${instanceId}] Connected: ${phone}`);
          
          instance.status = 'connected';
          instance.qrCode = null;
          instance.phone = phone;
          
          this.notifyWebSocket(instanceId, {
            type: 'status',
            status: 'connected',
            phone
          });

          // Send webhook notification
          if (instance.webhookUrl) {
            this.sendWebhook(instance.webhookUrl, {
              event: 'connection',
              instanceId,
              status: 'connected',
              phone
            });
          }
        }
      });

      socket.ev.on('creds.update', saveCreds);

      socket.ev.on('messages.upsert', async (m) => {
        if (instance.webhookUrl && m.messages) {
          for (const msg of m.messages) {
            if (!msg.key.fromMe) {
              this.sendWebhook(instance.webhookUrl, {
                event: 'message',
                instanceId,
                message: {
                  from: msg.key.remoteJid,
                  id: msg.key.id,
                  text: msg.message?.conversation || 
                        msg.message?.extendedTextMessage?.text || 
                        '[media]',
                  timestamp: msg.messageTimestamp
                }
              });
            }
          }
        }
      });

      // Return clean data without socket (avoid circular JSON)
      return { success: true, instance: this.getCleanInstanceData(instance) };
    } catch (error) {
      console.error(`[${instanceId}] Error creating instance:`, error);
      instance.status = 'error';
      return { success: false, error: error.message };
    }
  }

  async reconnectInstance(instanceId) {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      console.log(`[${instanceId}] Instance not found for reconnect`);
      return;
    }

    console.log(`[${instanceId}] Reconnecting...`);
    
    // Close existing socket
    if (instance.socket) {
      try {
        instance.socket.ev.removeAllListeners();
        instance.socket.end();
      } catch (e) {}
    }

    // Check if session exists
    const sessionPath = path.join(this.sessionsPath, instanceId);
    if (!fs.existsSync(sessionPath)) {
      console.log(`[${instanceId}] No session - creating fresh instance`);
      await this.createInstance(instanceId, instance.name, instance.webhookUrl);
      return;
    }

    try {
      const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
      
      console.log(`[${instanceId}] Reconnecting Baileys socket (v${STABLE_VERSION.join('.')})`);

      const socket = makeWASocket({
        logger,
        printQRInTerminal: true,
        auth: state,
        browser: Browsers.ubuntu('Chrome'),
        version: STABLE_VERSION
      });

      instance.socket = socket;
      instance.status = 'connecting';

      socket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        console.log(`[${instanceId}] Reconnect update:`, JSON.stringify(update));

        if (qr) {
          console.log(`[${instanceId}] New QR code during reconnect`);
          instance.status = 'qr_pending';
          instance.qrCode = await QRCode.toDataURL(qr);
          this.notifyWebSocket(instanceId, {
            type: 'qr',
            qrCode: instance.qrCode
          });
        }

        if (connection === 'close') {
          const statusCode = lastDisconnect?.error?.output?.statusCode;
          console.log(`[${instanceId}] Reconnect closed, statusCode: ${statusCode}`);
          
          if (statusCode === 401 || statusCode === DisconnectReason.loggedOut) {
            console.log(`[${instanceId}] Session invalid - need new QR`);
            instance.status = 'disconnected';
            instance.qrCode = null;
            instance.phone = null;
            
            if (fs.existsSync(sessionPath)) {
              fs.rmSync(sessionPath, { recursive: true });
            }
            
            // Create fresh instance for new QR
            await this.createInstance(instanceId, instance.name, instance.webhookUrl);
          } else {
            // Retry reconnect
            setTimeout(() => {
              this.reconnectInstance(instanceId);
            }, 5000);
          }
        }

        if (connection === 'open') {
          const phone = socket.user?.id?.split(':')[0] || null;
          console.log(`[${instanceId}] Reconnected: ${phone}`);
          
          instance.status = 'connected';
          instance.qrCode = null;
          instance.phone = phone;
          
          this.notifyWebSocket(instanceId, {
            type: 'status',
            status: 'connected',
            phone
          });
        }
      });

      socket.ev.on('creds.update', saveCreds);

    } catch (error) {
      console.error(`[${instanceId}] Reconnect error:`, error);
      setTimeout(() => {
        this.reconnectInstance(instanceId);
      }, 5000);
    }
  }

  async deleteInstance(instanceId) {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      return { success: false, error: 'Instance not found' };
    }

    console.log(`[${instanceId}] Deleting instance`);

    // Close socket
    if (instance.socket) {
      try {
        instance.socket.ev.removeAllListeners();
        instance.socket.end();
      } catch (e) {}
    }

    // Delete session files
    const sessionPath = path.join(this.sessionsPath, instanceId);
    if (fs.existsSync(sessionPath)) {
      fs.rmSync(sessionPath, { recursive: true });
    }

    this.instances.delete(instanceId);
    this.saveInstancesToFile();

    return { success: true };
  }

  getInstance(instanceId) {
    return this.instances.get(instanceId);
  }

  getAllInstances() {
    const result = [];
    for (const [id, instance] of this.instances) {
      result.push({
        id,
        name: instance.name,
        status: instance.status,
        phone: instance.phone,
        webhookUrl: instance.webhookUrl,
        createdAt: instance.createdAt
      });
    }
    return result;
  }

  getQRCode(instanceId) {
    const instance = this.instances.get(instanceId);
    return instance?.qrCode || null;
  }

  async sendMessage(instanceId, to, message, type = 'text', mediaUrl = null) {
    const instance = this.instances.get(instanceId);
    if (!instance || !instance.socket) {
      return { success: false, error: 'Instance not found or not connected' };
    }

    if (instance.status !== 'connected') {
      return { success: false, error: 'Instance is not connected' };
    }

    // Format phone number
    let jid = to;
    if (!jid.includes('@')) {
      jid = jid.replace(/\D/g, '') + '@s.whatsapp.net';
    }

    console.log(`[${instanceId}] Sending ${type} message to ${jid}`);

    try {
      let result;
      
      switch (type) {
        case 'image':
          result = await instance.socket.sendMessage(jid, {
            image: { url: mediaUrl },
            caption: message
          });
          break;
        case 'document':
          result = await instance.socket.sendMessage(jid, {
            document: { url: mediaUrl },
            fileName: message || 'document',
            caption: ''
          });
          break;
        case 'audio':
          result = await instance.socket.sendMessage(jid, {
            audio: { url: mediaUrl },
            mimetype: 'audio/mpeg'
          });
          break;
        default:
          result = await instance.socket.sendMessage(jid, { text: message });
      }
      
      return { success: true, messageId: result.key.id };
    } catch (error) {
      console.error(`[${instanceId}] Error sending message:`, error);
      return { success: false, error: error.message };
    }
  }

  async sendWebhook(url, data) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      console.log(`Webhook sent to ${url}, status: ${response.status}`);
    } catch (error) {
      console.error(`Error sending webhook to ${url}:`, error.message);
    }
  }

  setWebhook(instanceId, webhookUrl) {
    const instance = this.instances.get(instanceId);
    if (instance) {
      instance.webhookUrl = webhookUrl;
      this.saveInstancesToFile();
      return true;
    }
    return false;
  }
}

module.exports = new InstanceManager();
