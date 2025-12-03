export type InstanceStatus = 'connected' | 'disconnected' | 'connecting' | 'qr_pending';

export interface Instance {
  id: string;
  name: string;
  phone?: string;
  status: InstanceStatus;
  qrCode?: string;
  createdAt: Date;
  lastSeen?: Date;
  webhookUrl?: string;
  apiKey: string;
}

export interface SendMessagePayload {
  instanceId: string;
  to: string;
  message: string;
  type?: 'text' | 'image' | 'document' | 'audio';
  mediaUrl?: string;
}
