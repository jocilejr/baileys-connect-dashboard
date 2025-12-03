const PROXY_URL = 'https://ysvnadhzkidrshqgvgni.supabase.co/functions/v1/baileys-proxy';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlzdm5hZGh6a2lkcnNocWd2Z25pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ3MjY3MDAsImV4cCI6MjA4MDMwMjcwMH0.UbcaPV9mYQhsWlzm0Aol24n6VC6mvSrh_uVfwriPnJc';

interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

interface CreateInstanceResponse {
  instanceId: string;
  name: string;
  status: string;
}

interface InstanceStatusResponse {
  instanceId: string;
  status: string;
  phone?: string;
  name?: string;
}

interface SendMessageResponse {
  success: boolean;
  messageId?: string;
}

const proxyRequest = async <T>(path: string, options?: RequestInit): Promise<ApiResponse<T>> => {
  try {
    const url = `${PROXY_URL}?path=${encodeURIComponent(path)}`;
    
    console.log(`[API] Requesting: ${options?.method || 'GET'} ${path}`);
    
    const response = await fetch(url, {
      method: options?.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ANON_KEY}`,
      },
      body: options?.body,
    });

    const data = await response.json();
    console.log(`[API] Response:`, data);
    
    if (!response.ok) {
      return { success: false, error: data.error || data.message || 'Request failed' };
    }

    // Handle both wrapped and unwrapped responses from Baileys server
    if (data.success !== undefined) {
      return data;
    }
    
    // Wrap raw response data
    return { success: true, data: data as T };
  } catch (error) {
    console.error('API Error:', error);
    return { success: false, error: 'Erro de conexão com o servidor' };
  }
};

const generateInstanceId = () => {
  return 'inst_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
};

export const baileysApi = {
  createInstance: async (name: string, webhookUrl?: string): Promise<ApiResponse<CreateInstanceResponse>> => {
    const instanceId = generateInstanceId();
    return proxyRequest<CreateInstanceResponse>('/api/v1/instance/create', {
      method: 'POST',
      body: JSON.stringify({ instanceId, name, webhookUrl }),
    });
  },

  listInstances: async (): Promise<ApiResponse<InstanceStatusResponse[]>> => {
    const response = await proxyRequest<{ instances: InstanceStatusResponse[] }>('/api/v1/instance/list');
    if (response.success && response.data?.instances) {
      return { success: true, data: response.data.instances };
    }
    return { success: response.success, data: [], error: response.error };
  },

  getInstanceStatus: async (instanceId: string): Promise<ApiResponse<InstanceStatusResponse>> => {
    return proxyRequest<InstanceStatusResponse>(`/api/v1/instance/${instanceId}/status`);
  },

  deleteInstance: async (instanceId: string): Promise<ApiResponse<void>> => {
    return proxyRequest<void>(`/api/v1/instance/${instanceId}`, {
      method: 'DELETE',
    });
  },

  reconnectInstance: async (instanceId: string): Promise<ApiResponse<void>> => {
    return proxyRequest<void>(`/api/v1/instance/${instanceId}/reconnect`, {
      method: 'POST',
    });
  },

  sendMessage: async (
    instanceId: string,
    to: string,
    message: string,
    type: 'text' | 'image' | 'document' | 'audio' = 'text',
    mediaUrl?: string
  ): Promise<ApiResponse<SendMessageResponse>> => {
    const endpoint = type === 'text' ? 'send' : `send-${type}`;
    const body: Record<string, string> = { instanceId, to, message };
    if (mediaUrl) body.mediaUrl = mediaUrl;

    return proxyRequest<SendMessageResponse>(`/api/v1/message/${endpoint}`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
};

// WebSocket proxy URL (WSS through Supabase Edge Function)
export const BAILEYS_WS_URL = 'wss://ysvnadhzkidrshqgvgni.supabase.co/functions/v1/baileys-ws-proxy';
