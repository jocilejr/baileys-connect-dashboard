const express = require('express');
const router = express.Router();

// Middleware to get instance manager
const getInstanceManager = (req) => req.app.get('instanceManager');

// ==================== INSTANCE ROUTES ====================

// Create new instance
router.post('/instance/create', async (req, res) => {
  const { instanceId, name, webhookUrl } = req.body;
  
  if (!instanceId || !name) {
    return res.status(400).json({ error: 'instanceId and name are required' });
  }

  const instanceManager = getInstanceManager(req);
  const result = await instanceManager.createInstance(instanceId, name, webhookUrl);
  
  if (result.error) {
    return res.status(400).json(result);
  }
  
  res.json(result);
});

// Get instance status
router.get('/instance/:instanceId/status', (req, res) => {
  const { instanceId } = req.params;
  const instanceManager = getInstanceManager(req);
  const instance = instanceManager.getInstance(instanceId);
  
  if (!instance) {
    return res.status(404).json({ error: 'Instance not found' });
  }
  
  res.json({
    id: instance.id,
    name: instance.name,
    status: instance.status,
    phone: instance.phone,
    webhookUrl: instance.webhookUrl,
    createdAt: instance.createdAt
  });
});

// Get QR code
router.get('/instance/:instanceId/qr', (req, res) => {
  const { instanceId } = req.params;
  const instanceManager = getInstanceManager(req);
  const instance = instanceManager.getInstance(instanceId);
  
  if (!instance) {
    return res.status(404).json({ error: 'Instance not found' });
  }
  
  if (!instance.qrCode) {
    return res.status(400).json({ error: 'QR code not available', status: instance.status });
  }
  
  res.json({ qrCode: instance.qrCode });
});

// List all instances
router.get('/instance/list', (req, res) => {
  const instanceManager = getInstanceManager(req);
  const instances = instanceManager.getAllInstances();
  res.json({ instances });
});

// Delete instance
router.delete('/instance/:instanceId', async (req, res) => {
  const { instanceId } = req.params;
  const instanceManager = getInstanceManager(req);
  const result = await instanceManager.deleteInstance(instanceId);
  
  if (result.error) {
    return res.status(404).json(result);
  }
  
  res.json(result);
});

// Reconnect instance
router.post('/instance/:instanceId/reconnect', async (req, res) => {
  const { instanceId } = req.params;
  const instanceManager = getInstanceManager(req);
  
  await instanceManager.reconnectInstance(instanceId);
  res.json({ success: true, message: 'Reconnecting...' });
});

// Update webhook
router.put('/instance/:instanceId/webhook', (req, res) => {
  const { instanceId } = req.params;
  const { webhookUrl } = req.body;
  const instanceManager = getInstanceManager(req);
  const instance = instanceManager.getInstance(instanceId);
  
  if (!instance) {
    return res.status(404).json({ error: 'Instance not found' });
  }
  
  instance.webhookUrl = webhookUrl;
  res.json({ success: true, webhookUrl });
});

// ==================== MESSAGE ROUTES ====================

// Send text message
router.post('/message/send', async (req, res) => {
  const { instanceId, to, message, type = 'text', mediaUrl } = req.body;
  
  if (!instanceId || !to || !message) {
    return res.status(400).json({ error: 'instanceId, to, and message are required' });
  }

  const instanceManager = getInstanceManager(req);
  const result = await instanceManager.sendMessage(instanceId, to, message, type, mediaUrl);
  
  if (result.error) {
    return res.status(400).json(result);
  }
  
  res.json(result);
});

// Send image
router.post('/message/send-image', async (req, res) => {
  const { instanceId, to, caption, imageUrl } = req.body;
  
  if (!instanceId || !to || !imageUrl) {
    return res.status(400).json({ error: 'instanceId, to, and imageUrl are required' });
  }

  const instanceManager = getInstanceManager(req);
  const result = await instanceManager.sendMessage(instanceId, to, caption || '', 'image', imageUrl);
  
  if (result.error) {
    return res.status(400).json(result);
  }
  
  res.json(result);
});

// Send document
router.post('/message/send-document', async (req, res) => {
  const { instanceId, to, caption, documentUrl } = req.body;
  
  if (!instanceId || !to || !documentUrl) {
    return res.status(400).json({ error: 'instanceId, to, and documentUrl are required' });
  }

  const instanceManager = getInstanceManager(req);
  const result = await instanceManager.sendMessage(instanceId, to, caption || '', 'document', documentUrl);
  
  if (result.error) {
    return res.status(400).json(result);
  }
  
  res.json(result);
});

// Send audio
router.post('/message/send-audio', async (req, res) => {
  const { instanceId, to, audioUrl } = req.body;
  
  if (!instanceId || !to || !audioUrl) {
    return res.status(400).json({ error: 'instanceId, to, and audioUrl are required' });
  }

  const instanceManager = getInstanceManager(req);
  const result = await instanceManager.sendMessage(instanceId, to, '', 'audio', audioUrl);
  
  if (result.error) {
    return res.status(400).json(result);
  }
  
  res.json(result);
});

module.exports = router;
