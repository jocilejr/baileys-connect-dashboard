const makeWASocket = require('@whiskeysockets/baileys').default;
const { 
  DisconnectReason, 
  useMultiFileAuthState,
  makeInMemoryStore,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');

const logger = pino({ level: 'silent' });

class InstanceManager {
  constructor() {
    this.instances = new Map();
    this.reconnecting = new Set(); // Track instances currently reconnecting
    this.sessionsPath = path.join(__dirname, '../sessions');
    
    // Create sessions directory if it doesn't exist
    if (!fs.existsSync(this.sessionsPath)) {
      fs.mkdirSync(this.sessionsPath, { recursive: true });
    }
  }

  async createInstance(instanceId, name, webhookUrl = null) {
    if (this.instances.has(instanceId)) {
      return { error: 'Instance already exists' };
    }

    const sessionPath = path.join(this.sessionsPath, instanceId);
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    
    const store = makeInMemoryStore({ logger });
    
    const instance = {
      id: instanceId,
      name,
      webhookUrl,
      status: 'connecting',
      qrCode: null,
      phone: null,
      socket: null,
      store,
      createdAt: new Date()
    };

    this.instances.set(instanceId, instance);

    try {
      const { version } = await fetchLatestBaileysVersion();
      
      const socket = makeWASocket({
        version,
        logger,
        printQRInTerminal: true,
        auth: state,
        browser: ['Lovable WhatsApp', 'Chrome', '120.0.0'],
        getMessage: async (key) => {
          const msg = await store.loadMessage(key.remoteJid, key.id);
          return msg?.message || undefined;
        }
      });

      store.bind(socket.ev);
      instance.socket = socket;

      // Handle connection updates
      socket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          instance.status = 'qr_pending';
          instance.qrCode = await QRCode.toDataURL(qr);
          this.notifyWebSocket(instanceId, {
            type: 'qr',
            qrCode: instance.qrCode
          });
        }

        if (connection === 'close') {
          const statusCode = lastDisconnect?.error?.output?.statusCode;
          const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
          
          if (shouldReconnect && !this.reconnecting.has(instanceId)) {
            instance.status = 'reconnecting';
            console.log(`Reconnecting instance ${instanceId}...`);
            // Add delay to prevent rapid reconnection loops
            setTimeout(() => {
              this.reconnectInstance(instanceId);
            }, 3000);
          } else if (!shouldReconnect) {
            instance.status = 'disconnected';
            instance.qrCode = null;
            this.notifyWebSocket(instanceId, {
              type: 'status',
              status: 'disconnected'
            });
          }
        }

        if (connection === 'open') {
          instance.status = 'connected';
          instance.qrCode = null;
          instance.phone = socket.user?.id?.split(':')[0] || null;
          this.reconnecting.delete(instanceId); // Clear reconnecting flag
          
          this.notifyWebSocket(instanceId, {
            type: 'status',
            status: 'connected',
            phone: instance.phone
          });
          
          console.log(`Instance ${instanceId} connected: ${instance.phone}`);
        }
      });

      // Handle credentials update
      socket.ev.on('creds.update', saveCreds);

      // Handle incoming messages
      socket.ev.on('messages.upsert', async (m) => {
        const message = m.messages[0];
        if (!message.key.fromMe && m.type === 'notify') {
          console.log(`New message on ${instanceId}:`, message);
          
          // Send to webhook if configured
          if (instance.webhookUrl) {
            this.sendWebhook(instance.webhookUrl, {
              instanceId,
              type: 'message',
              data: message
            });
          }

          this.notifyWebSocket(instanceId, {
            type: 'message',
            data: message
          });
        }
      });

      return { success: true, instanceId };
    } catch (error) {
      console.error(`Error creating instance ${instanceId}:`, error);
      instance.status = 'error';
      return { error: error.message };
    }
  }

  async reconnectInstance(instanceId) {
    // Prevent multiple simultaneous reconnections
    if (this.reconnecting.has(instanceId)) {
      console.log(`Instance ${instanceId} is already reconnecting, skipping...`);
      return;
    }

    const instance = this.instances.get(instanceId);
    if (!instance) return;

    this.reconnecting.add(instanceId);

    // Safely close existing socket
    if (instance.socket) {
      try {
        // Check if socket is in a state where it can be closed
        if (instance.socket.ws && instance.socket.ws.readyState !== undefined) {
          instance.socket.end();
        }
      } catch (error) {
        console.log(`Error closing socket for ${instanceId}:`, error.message);
        // Continue with reconnection even if closing fails
      }
    }

    // Store instance data before removing
    const { name, webhookUrl } = instance;

    // Remove instance
    this.instances.delete(instanceId);

    // Wait a bit before recreating
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Recreate instance
    try {
      await this.createInstance(instanceId, name, webhookUrl);
    } catch (error) {
      console.error(`Error recreating instance ${instanceId}:`, error);
    } finally {
      this.reconnecting.delete(instanceId);
    }
  }

  async deleteInstance(instanceId) {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      return { error: 'Instance not found' };
    }

    // Close socket safely
    if (instance.socket) {
      try {
        instance.socket.end();
      } catch (error) {
        console.log(`Error closing socket for ${instanceId}:`, error.message);
      }
    }

    // Delete session files
    const sessionPath = path.join(this.sessionsPath, instanceId);
    if (fs.existsSync(sessionPath)) {
      fs.rmSync(sessionPath, { recursive: true });
    }

    this.instances.delete(instanceId);
    this.reconnecting.delete(instanceId);
    return { success: true };
  }

  getInstance(instanceId) {
    return this.instances.get(instanceId);
  }

  getAllInstances() {
    const instances = [];
    for (const [id, instance] of this.instances) {
      instances.push({
        id,
        name: instance.name,
        status: instance.status,
        phone: instance.phone,
        webhookUrl: instance.webhookUrl,
        createdAt: instance.createdAt
      });
    }
    return instances;
  }

  async sendMessage(instanceId, to, message, type = 'text', mediaUrl = null) {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      return { error: 'Instance not found' };
    }

    if (instance.status !== 'connected') {
      return { error: 'Instance not connected' };
    }

    try {
      // Format phone number
      const jid = to.includes('@s.whatsapp.net') ? to : `${to.replace(/\D/g, '')}@s.whatsapp.net`;

      let result;

      switch (type) {
        case 'text':
          result = await instance.socket.sendMessage(jid, { text: message });
          break;
        
        case 'image':
          result = await instance.socket.sendMessage(jid, {
            image: { url: mediaUrl },
            caption: message
          });
          break;
        
        case 'document':
          result = await instance.socket.sendMessage(jid, {
            document: { url: mediaUrl },
            caption: message,
            fileName: mediaUrl.split('/').pop()
          });
          break;
        
        case 'audio':
          result = await instance.socket.sendMessage(jid, {
            audio: { url: mediaUrl },
            mimetype: 'audio/mp4'
          });
          break;
        
        default:
          result = await instance.socket.sendMessage(jid, { text: message });
      }

      return { success: true, messageId: result.key.id };
    } catch (error) {
      console.error(`Error sending message on ${instanceId}:`, error);
      return { error: error.message };
    }
  }

  notifyWebSocket(instanceId, data) {
    // This will be called from the main app with access to wsConnections
    if (this.wsNotifier) {
      this.wsNotifier(instanceId, data);
    }
  }

  setWsNotifier(notifier) {
    this.wsNotifier = notifier;
  }

  async sendWebhook(url, data) {
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
    } catch (error) {
      console.error('Webhook error:', error);
    }
  }
}

const instanceManager = new InstanceManager();

module.exports = { instanceManager, InstanceManager };
