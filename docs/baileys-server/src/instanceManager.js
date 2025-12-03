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

// Change to 'info' to see Baileys logs, 'silent' to hide them
const logger = pino({ level: 'warn' });

class InstanceManager {
  constructor() {
    this.instances = new Map();
    this.reconnecting = new Set(); // Track instances currently reconnecting
    this.sessionsPath = path.join(__dirname, '../sessions');
    this.instancesFile = path.join(__dirname, '../instances.json');
    
    // Create sessions directory if it doesn't exist
    if (!fs.existsSync(this.sessionsPath)) {
      fs.mkdirSync(this.sessionsPath, { recursive: true });
    }
    
    // Load saved instances on startup
    this.loadSavedInstances();
  }

  // Save instances metadata to file
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

  // Load instances from file and recreate them
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

  async createInstance(instanceId, name, webhookUrl = null) {
    // If instance exists and has an active socket, close it first
    if (this.instances.has(instanceId)) {
      const existingInstance = this.instances.get(instanceId);
      if (existingInstance.socket) {
        console.log(`[${instanceId}] Closing existing socket before creating new instance`);
        try {
          existingInstance.socket.ev.removeAllListeners();
          existingInstance.socket.ws?.close();
          existingInstance.socket.end();
        } catch (e) {
          console.log(`[${instanceId}] Error closing existing socket:`, e.message);
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      this.instances.delete(instanceId);
    }

    console.log(`Creating instance ${instanceId} with name: ${name}`);
    
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
      createdAt: new Date(),
      hadNewLogin: false // Track if we just paired
    };

    this.instances.set(instanceId, instance);
    this.saveInstancesToFile();

    try {
      const { version } = await fetchLatestBaileysVersion();
      console.log(`Using Baileys version: ${version.join('.')}`);
      
      const socket = makeWASocket({
        version,
        logger,
        printQRInTerminal: true,
        auth: state,
        browser: ['Ubuntu', 'Chrome', '120.0.0'],
        syncFullHistory: false,
        markOnlineOnConnect: false,
        connectTimeoutMs: 60000,
        qrTimeout: 60000,
        defaultQueryTimeoutMs: 60000,
        retryRequestDelayMs: 2000,
        keepAliveIntervalMs: 25000,
        getMessage: async (key) => {
          const msg = await store.loadMessage(key.remoteJid, key.id);
          return msg?.message || undefined;
        }
      });

      store.bind(socket.ev);
      instance.socket = socket;

      // Handle connection updates
      socket.ev.on('connection.update', async (update) => {
        console.log(`[${instanceId}] Connection update:`, JSON.stringify(update));
        const { connection, lastDisconnect, qr, isNewLogin } = update;

        // Track if this is a new login (QR was just scanned)
        if (isNewLogin) {
          console.log(`[${instanceId}] New login detected - credentials will be saved`);
          instance.hadNewLogin = true;
        }

        if (qr) {
          console.log(`[${instanceId}] QR code received from Baileys`);
          instance.status = 'qr_pending';
          instance.qrCode = await QRCode.toDataURL(qr);
          console.log(`[${instanceId}] QR Code converted to data URL`);
          this.notifyWebSocket(instanceId, {
            type: 'qr',
            qrCode: instance.qrCode
          });
        }

        if (connection === 'close') {
          const statusCode = lastDisconnect?.error?.output?.statusCode;
          const isLoggedOut = statusCode === DisconnectReason.loggedOut;
          
          console.log(`Connection closed for ${instanceId}, statusCode: ${statusCode}, loggedOut: ${isLoggedOut}, hadNewLogin: ${instance.hadNewLogin}`);
          
          // Handle stream errors (515) - This is EXPECTED after scanning QR!
          // After pairing, WhatsApp closes the connection and expects us to reconnect
          if (statusCode === 515) {
            console.log(`[${instanceId}] Stream error 515 - this is expected after pairing, reconnecting...`);
            
            // Wait for credentials to be fully saved before cleanup
            console.log(`[${instanceId}] Waiting 3 seconds for credentials to save...`);
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // Clean up current socket
            try {
              socket.ev.removeAllListeners();
              socket.ws?.close();
            } catch (e) {
              console.log(`[${instanceId}] Error during 515 cleanup:`, e.message);
            }
            
            // Wait a bit more then reconnect (WITHOUT deleting session - credentials are saved!)
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Reconnect using saved credentials
            console.log(`[${instanceId}] Reconnecting after 515 with saved credentials...`);
            this.reconnectWithoutDeletingSession(instanceId);
            return;
          }
          
          // Handle precondition required (428) - connection terminated
          if (statusCode === 428) {
            console.log(`[${instanceId}] Connection terminated (428), reconnecting...`);
            
            // Clean up and reconnect
            try {
              socket.ev.removeAllListeners();
              socket.ws?.close();
            } catch (e) {
              console.log(`[${instanceId}] Error during 428 cleanup:`, e.message);
            }
            
            await new Promise(resolve => setTimeout(resolve, 2000));
            this.reconnectWithoutDeletingSession(instanceId);
            return;
          }
          
          // Only mark as disconnected and require new QR if user logged out
          if (isLoggedOut) {
            console.log(`[${instanceId}] User logged out - will need new QR`);
            instance.status = 'disconnected';
            instance.qrCode = null;
            instance.phone = null;
            instance.hadNewLogin = false;
            
            // Delete session files since user logged out
            const sessionPath = path.join(this.sessionsPath, instanceId);
            if (fs.existsSync(sessionPath)) {
              fs.rmSync(sessionPath, { recursive: true });
            }
            
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
          instance.hadNewLogin = false;
          this.reconnecting.delete(instanceId);
          
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

  // Reconnect WITHOUT deleting session files (for 515/428 errors after pairing)
  async reconnectWithoutDeletingSession(instanceId) {
    if (this.reconnecting.has(instanceId)) {
      console.log(`Instance ${instanceId} is already reconnecting, skipping...`);
      return;
    }

    const instance = this.instances.get(instanceId);
    if (!instance) {
      console.log(`Instance ${instanceId} not found for reconnection`);
      return;
    }

    this.reconnecting.add(instanceId);
    console.log(`[${instanceId}] Reconnecting with saved credentials...`);

    // Store instance data
    const { name, webhookUrl } = instance;

    // Remove from memory (but NOT session files!)
    this.instances.delete(instanceId);

    // Wait before recreating
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Recreate instance - will use saved credentials
    try {
      await this.createInstance(instanceId, name, webhookUrl);
    } catch (error) {
      console.error(`Error recreating instance ${instanceId}:`, error);
    } finally {
      this.reconnecting.delete(instanceId);
    }
  }

  // Manual reconnect - deletes session to force new QR
  async reconnectInstance(instanceId) {
    if (this.reconnecting.has(instanceId)) {
      console.log(`Instance ${instanceId} is already reconnecting, skipping...`);
      return;
    }

    const instance = this.instances.get(instanceId);
    if (!instance) {
      console.log(`Instance ${instanceId} not found for reconnection`);
      return;
    }

    this.reconnecting.add(instanceId);
    console.log(`Starting manual reconnection for ${instanceId}...`);

    // Safely close existing socket
    if (instance.socket) {
      try {
        console.log(`[${instanceId}] Removing all listeners and closing socket...`);
        instance.socket.ev.removeAllListeners();
        if (instance.socket.ws) {
          instance.socket.ws.close();
        }
        instance.socket.end();
      } catch (error) {
        console.log(`Error closing socket for ${instanceId}:`, error.message);
      }
    }

    // Store instance data before removing
    const { name, webhookUrl } = instance;

    // Remove instance from memory
    this.instances.delete(instanceId);

    // Delete session files to force new QR code generation
    const sessionPath = path.join(this.sessionsPath, instanceId);
    if (fs.existsSync(sessionPath)) {
      console.log(`Deleting session files for ${instanceId} to generate new QR...`);
      fs.rmSync(sessionPath, { recursive: true });
    }

    // Wait before recreating
    console.log(`[${instanceId}] Waiting 2 seconds before creating new instance...`);
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Recreate instance
    try {
      console.log(`Creating new instance ${instanceId}...`);
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
        instance.socket.ev.removeAllListeners();
        if (instance.socket.ws) {
          instance.socket.ws.close();
        }
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
    this.saveInstancesToFile();
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
