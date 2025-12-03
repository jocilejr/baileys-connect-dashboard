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

  // Check if a phone number is already connected to another instance
  getInstanceByPhone(phone) {
    for (const [id, instance] of this.instances) {
      if (instance.phone && instance.phone === phone && instance.status === 'connected') {
        return { id, instance };
      }
    }
    return null;
  }

  // Disconnect other instances using the same phone number
  async disconnectOtherInstancesWithPhone(phone, currentInstanceId) {
    for (const [id, instance] of this.instances) {
      if (id !== currentInstanceId && instance.phone === phone && instance.status === 'connected') {
        console.log(`[${id}] Disconnecting because phone ${phone} is connecting on ${currentInstanceId}`);
        instance.status = 'disconnected';
        instance.phone = null;
        instance.qrCode = null;
        
        // Close socket
        if (instance.socket) {
          try {
            instance.socket.ev.removeAllListeners();
            instance.socket.end();
          } catch (e) {
            console.log(`[${id}] Error closing socket:`, e.message);
          }
          instance.socket = null;
        }
        
        // Delete session files
        const sessionPath = path.join(this.sessionsPath, id);
        if (fs.existsSync(sessionPath)) {
          fs.rmSync(sessionPath, { recursive: true });
        }
        
        // Notify frontend
        this.notifyWebSocket(id, { type: 'status', status: 'disconnected' });
      }
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
        markOnlineOnConnect: true,
        fireInitQueries: true,
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
          const errorContent = lastDisconnect?.error?.data?.content;
          const isDeviceRemoved = errorContent?.some?.(c => c.tag === 'conflict' && c.attrs?.type === 'device_removed');
          
          console.log(`Connection closed for ${instanceId}, statusCode: ${statusCode}, loggedOut: ${isLoggedOut}, deviceRemoved: ${isDeviceRemoved}, hadNewLogin: ${instance.hadNewLogin}`);
          
          // Handle 401 (Unauthorized) - device was removed from WhatsApp
          // This can happen when:
          // 1. User removes the linked device from their phone
          // 2. Same number is connected on another instance
          // 3. WhatsApp kicks the device for security reasons
          if (statusCode === 401 || isDeviceRemoved) {
            console.log(`[${instanceId}] Device removed or unauthorized (401) - marking as disconnected`);
            
            // IMPORTANT: Send notification BEFORE cleaning up
            instance.status = 'disconnected';
            const phone = instance.phone;
            instance.qrCode = null;
            instance.phone = null;
            instance.hadNewLogin = false;
            this.reconnecting.delete(instanceId);
            
            // Send notification immediately
            console.log(`[${instanceId}] Sending disconnect notification to frontend...`);
            this.notifyWebSocket(instanceId, {
              type: 'status',
              status: 'disconnected',
              reason: 'device_removed'
            });
            
            // Wait a moment for notification to be sent
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Delete session files since device was removed
            const sessionPath = path.join(this.sessionsPath, instanceId);
            if (fs.existsSync(sessionPath)) {
              console.log(`[${instanceId}] Deleting session files after 401...`);
              fs.rmSync(sessionPath, { recursive: true });
            }
            
            return;
          }
          
          // Handle stream errors (515) - This happens after pairing completes
          if (statusCode === 515) {
            console.log(`[${instanceId}] Stream error 515, hadNewLogin: ${instance.hadNewLogin}`);
            
            const sessionPath = path.join(this.sessionsPath, instanceId);
            
            // CRITICAL: If this was a NEW LOGIN (QR scan), ALWAYS generate new QR
            // The credentials saved during 515 after new login are INCOMPLETE
            // They will pass basic validation but WhatsApp will reject them with 401
            if (instance.hadNewLogin) {
              console.log(`[${instanceId}] 515 after NEW LOGIN - credentials are incomplete, generating fresh QR`);
              
              // Delete the incomplete session
              if (fs.existsSync(sessionPath)) {
                console.log(`[${instanceId}] Deleting incomplete session files...`);
                try {
                  fs.rmSync(sessionPath, { recursive: true });
                } catch (e) {
                  console.log(`[${instanceId}] Error deleting session:`, e.message);
                }
              }
              
              instance.hadNewLogin = false;
              instance.qrCode = null;
              instance.phone = null;
              instance.status = 'qr_pending';
              
              try {
                socket.ev.removeAllListeners();
                socket.ws?.close();
              } catch (e) {
                console.log(`[${instanceId}] Error cleaning up socket:`, e.message);
              }
              
              // Wait before generating new QR
              console.log(`[${instanceId}] Waiting 3 seconds before generating new QR...`);
              await new Promise(resolve => setTimeout(resolve, 3000));
              
              this.notifyWebSocket(instanceId, { type: 'status', status: 'qr_pending' });
              
              console.log(`[${instanceId}] Creating fresh socket for new QR...`);
              this.createInstance(instanceId, instance.name, instance.webhookUrl);
              return;
            }
            
            // For EXISTING sessions (not new login), check credentials and reconnect
            const credsPath = path.join(sessionPath, 'creds.json');
            let credsValid = false;
            
            if (fs.existsSync(credsPath)) {
              try {
                const credsSize = fs.statSync(credsPath).size;
                const credsContent = JSON.parse(fs.readFileSync(credsPath, 'utf-8'));
                // Strict validation for existing sessions
                credsValid = credsSize > 2000 && 
                             credsContent.me?.id && 
                             credsContent.noiseKey && 
                             credsContent.signedIdentityKey &&
                             credsContent.registrationId;
                console.log(`[${instanceId}] Credentials check: size=${credsSize}, valid=${credsValid}`);
              } catch (e) {
                console.log(`[${instanceId}] Error reading credentials:`, e.message);
              }
            }
            
            if (!credsValid) {
              console.log(`[${instanceId}] 515 with invalid credentials - generating new QR`);
              
              if (fs.existsSync(sessionPath)) {
                try {
                  fs.rmSync(sessionPath, { recursive: true });
                } catch (e) {
                  console.log(`[${instanceId}] Error deleting session:`, e.message);
                }
              }
              
              instance.status = 'qr_pending';
              instance.qrCode = null;
              instance.phone = null;
              
              try {
                socket.ev.removeAllListeners();
              } catch (e) {}
              
              await new Promise(resolve => setTimeout(resolve, 2000));
              this.notifyWebSocket(instanceId, { type: 'status', status: 'qr_pending' });
              this.createInstance(instanceId, instance.name, instance.webhookUrl);
              return;
            }
            
            console.log(`[${instanceId}] 515 on existing session with valid credentials - reconnecting...`);
            
            try {
              socket.ev.removeAllListeners();
            } catch (e) {}
            
            await new Promise(resolve => setTimeout(resolve, 2000));
            this.reconnectWithoutDeletingSession(instanceId);
            return;
          }
          
          // Handle precondition required (428)
          if (statusCode === 428) {
            console.log(`[${instanceId}] Connection terminated (428), reconnecting...`);
            
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
          const phone = socket.user?.id?.split(':')[0] || null;
          
          // Check if this phone is already connected to another instance
          // and disconnect the other instance
          if (phone) {
            await this.disconnectOtherInstancesWithPhone(phone, instanceId);
          }
          
          instance.status = 'connected';
          instance.qrCode = null;
          instance.phone = phone;
          instance.hadNewLogin = false;
          this.reconnecting.delete(instanceId);
          
          // Send presence update to sync with phone
          try {
            await socket.sendPresenceUpdate('available');
            console.log(`[${instanceId}] Presence update sent to sync with phone`);
          } catch (e) {
            console.log(`[${instanceId}] Error sending presence update:`, e.message);
          }
          
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
    console.log(`[${instanceId}] Reconnecting with saved credentials (keeping instance in memory)...`);

    instance.status = 'connecting';
    instance.qrCode = null;

    // Close existing socket safely
    if (instance.socket) {
      try {
        instance.socket.ev.removeAllListeners();
        instance.socket.end();
      } catch (e) {
        console.log(`[${instanceId}] Error closing socket:`, e.message);
      }
      instance.socket = null;
    }

    await new Promise(resolve => setTimeout(resolve, 2000));

    try {
      const sessionPath = path.join(this.sessionsPath, instanceId);
      const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
      const { version } = await fetchLatestBaileysVersion();
      
      console.log(`[${instanceId}] Creating new socket with saved credentials...`);
      
      const socket = makeWASocket({
        version,
        logger,
        printQRInTerminal: true,
        auth: state,
        browser: ['Ubuntu', 'Chrome', '120.0.0'],
        syncFullHistory: false,
        markOnlineOnConnect: true,
        fireInitQueries: true,
        connectTimeoutMs: 60000,
        qrTimeout: 60000,
        defaultQueryTimeoutMs: 60000,
        retryRequestDelayMs: 2000,
        keepAliveIntervalMs: 25000,
        getMessage: async (key) => {
          const msg = await instance.store.loadMessage(key.remoteJid, key.id);
          return msg?.message || undefined;
        }
      });

      instance.store.bind(socket.ev);
      instance.socket = socket;

      // Handle connection updates during reconnect
      socket.ev.on('connection.update', async (update) => {
        console.log(`[${instanceId}] Connection update:`, JSON.stringify(update));
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          console.log(`[${instanceId}] QR code received (unexpected during reconnect with creds)`);
          instance.status = 'qr_pending';
          instance.qrCode = await QRCode.toDataURL(qr);
          this.notifyWebSocket(instanceId, { type: 'qr', qrCode: instance.qrCode });
        }

        if (connection === 'close') {
          const statusCode = lastDisconnect?.error?.output?.statusCode;
          const errorContent = lastDisconnect?.error?.data?.content;
          const isDeviceRemoved = errorContent?.some?.(c => c.tag === 'conflict' && c.attrs?.type === 'device_removed');
          
          console.log(`[${instanceId}] Connection closed during reconnect, statusCode: ${statusCode}, deviceRemoved: ${isDeviceRemoved}`);
          
          // Handle 401 (Unauthorized) - device was removed from WhatsApp
          if (statusCode === 401 || isDeviceRemoved) {
            console.log(`[${instanceId}] Device removed during reconnect (401) - marking as disconnected`);
            
            // IMPORTANT: Send notification BEFORE cleaning up
            instance.status = 'disconnected';
            instance.qrCode = null;
            instance.phone = null;
            instance.hadNewLogin = false;
            this.reconnecting.delete(instanceId);
            
            // Send notification immediately
            console.log(`[${instanceId}] Sending disconnect notification to frontend...`);
            this.notifyWebSocket(instanceId, {
              type: 'status',
              status: 'disconnected',
              reason: 'device_removed'
            });
            
            // Wait for notification to be sent
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Delete session files
            const sessionPath = path.join(this.sessionsPath, instanceId);
            if (fs.existsSync(sessionPath)) {
              console.log(`[${instanceId}] Deleting session files after 401...`);
              fs.rmSync(sessionPath, { recursive: true });
            }
            return;
          }
          
          if (statusCode === DisconnectReason.loggedOut) {
            instance.status = 'disconnected';
            instance.phone = null;
            this.reconnecting.delete(instanceId);
            this.notifyWebSocket(instanceId, { type: 'status', status: 'disconnected' });
          }
        }

        if (connection === 'open') {
          const phone = socket.user?.id?.split(':')[0] || null;
          
          // Check if this phone is already connected to another instance
          if (phone) {
            await this.disconnectOtherInstancesWithPhone(phone, instanceId);
          }
          
          instance.status = 'connected';
          instance.qrCode = null;
          instance.phone = phone;
          this.reconnecting.delete(instanceId);
          
          try {
            await socket.sendPresenceUpdate('available');
            console.log(`[${instanceId}] Presence update sent to sync with phone`);
          } catch (e) {
            console.log(`[${instanceId}] Error sending presence update:`, e.message);
          }
          
          this.notifyWebSocket(instanceId, {
            type: 'status',
            status: 'connected',
            phone: instance.phone
          });
          
          console.log(`[${instanceId}] Reconnected successfully: ${instance.phone}`);
        }
      });

      socket.ev.on('creds.update', saveCreds);

      socket.ev.on('messages.upsert', async (m) => {
        const message = m.messages[0];
        if (!message.key.fromMe && m.type === 'notify') {
          if (instance.webhookUrl) {
            this.sendWebhook(instance.webhookUrl, { instanceId, type: 'message', data: message });
          }
          this.notifyWebSocket(instanceId, { type: 'message', data: message });
        }
      });

    } catch (error) {
      console.error(`[${instanceId}] Error during reconnection:`, error);
      instance.status = 'error';
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
          // Only close if WebSocket is open (readyState 1) or connecting (readyState 0)
          const wsState = instance.socket.ws.readyState;
          if (wsState === 1) { // OPEN
            instance.socket.ws.close();
          } else {
            console.log(`[${instanceId}] WebSocket not open (state: ${wsState}), skipping close`);
          }
        }
        // Use end with error to safely terminate
        try {
          instance.socket.end(new Error('Manual reconnection'));
        } catch (endError) {
          console.log(`[${instanceId}] Socket end error (safe to ignore):`, endError.message);
        }
      } catch (error) {
        console.log(`Error closing socket for ${instanceId}:`, error.message);
      }
    }

    const { name, webhookUrl } = instance;

    this.instances.delete(instanceId);

    const sessionPath = path.join(this.sessionsPath, instanceId);
    if (fs.existsSync(sessionPath)) {
      console.log(`Deleting session files for ${instanceId} to generate new QR...`);
      fs.rmSync(sessionPath, { recursive: true });
    }

    console.log(`[${instanceId}] Waiting 2 seconds before creating new instance...`);
    await new Promise(resolve => setTimeout(resolve, 2000));

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

    // Close socket if exists
    if (instance.socket) {
      try {
        instance.socket.ev.removeAllListeners();
        instance.socket.end();
      } catch (error) {
        console.log(`Error closing socket for ${instanceId}:`, error.message);
      }
    }

    // Remove from memory
    this.instances.delete(instanceId);
    this.saveInstancesToFile();

    // Delete session files
    const sessionPath = path.join(this.sessionsPath, instanceId);
    if (fs.existsSync(sessionPath)) {
      fs.rmSync(sessionPath, { recursive: true });
    }

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

  async sendMessage(instanceId, to, message, options = {}) {
    const instance = this.instances.get(instanceId);
    if (!instance || !instance.socket) {
      return { error: 'Instance not found or not connected' };
    }

    if (instance.status !== 'connected') {
      return { error: 'Instance is not connected' };
    }

    try {
      // Format number
      let jid = to;
      if (!jid.includes('@')) {
        jid = jid.replace(/[^\d]/g, '') + '@s.whatsapp.net';
      }

      let result;

      if (options.image) {
        result = await instance.socket.sendMessage(jid, {
          image: { url: options.image },
          caption: message
        });
      } else if (options.document) {
        result = await instance.socket.sendMessage(jid, {
          document: { url: options.document },
          fileName: options.fileName || 'document',
          mimetype: options.mimetype || 'application/octet-stream',
          caption: message
        });
      } else if (options.audio) {
        result = await instance.socket.sendMessage(jid, {
          audio: { url: options.audio },
          mimetype: 'audio/mp4',
          ptt: options.ptt || false
        });
      } else {
        result = await instance.socket.sendMessage(jid, { text: message });
      }

      return { success: true, messageId: result.key.id };
    } catch (error) {
      console.error(`Error sending message on ${instanceId}:`, error);
      return { error: error.message };
    }
  }

  async sendWebhook(url, data) {
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
    } catch (error) {
      console.error('Error sending webhook:', error);
    }
  }

  // WebSocket connections management
  wsConnections = new Map(); // instanceId -> Set of WebSocket clients
  legacyWsNotifier = null; // Legacy notifier for routes.js compatibility

  // Legacy method for routes.js compatibility
  setWsNotifier(notifier) {
    this.legacyWsNotifier = notifier;
  }

  addWebSocketConnection(instanceId, ws) {
    if (!this.wsConnections.has(instanceId)) {
      this.wsConnections.set(instanceId, new Set());
    }
    this.wsConnections.get(instanceId).add(ws);
    console.log(`WebSocket connected for instance: ${instanceId}`);
  }

  removeWebSocketConnection(instanceId, ws) {
    if (this.wsConnections.has(instanceId)) {
      this.wsConnections.get(instanceId).delete(ws);
      console.log(`WebSocket disconnected for instance: ${instanceId}`);
    }
  }

  notifyWebSocket(instanceId, data) {
    // Use legacy notifier if available (for routes.js compatibility)
    if (this.legacyWsNotifier) {
      try {
        this.legacyWsNotifier(instanceId, data);
      } catch (e) {
        console.error(`[${instanceId}] Error in legacy WebSocket notifier:`, e.message);
      }
    }
    
    // Also use the new connection management
    const connections = this.wsConnections.get(instanceId);
    if (connections && connections.size > 0) {
      const message = JSON.stringify(data);
      console.log(`[${instanceId}] Notifying ${connections.size} WebSocket clients:`, message);
      for (const ws of connections) {
        try {
          if (ws.readyState === 1) { // WebSocket.OPEN
            ws.send(message);
          }
        } catch (e) {
          console.error(`[${instanceId}] Error sending WebSocket message:`, e.message);
        }
      }
    } else if (!this.legacyWsNotifier) {
      console.log(`[${instanceId}] No WebSocket clients to notify`);
    }
  }

  // Get QR code for instance
  getQRCode(instanceId) {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      return { error: 'Instance not found' };
    }
    
    return {
      qrCode: instance.qrCode,
      status: instance.status
    };
  }
}

module.exports = new InstanceManager();
