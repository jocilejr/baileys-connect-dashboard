const API_BASE_URL = 'http://72.60.249.69:3001/api/v1';

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

const handleResponse = async <T>(response: Response): Promise<ApiResponse<T>> => {
  if (!response.ok) {
    const error = await response.text();
    return { success: false, error };
  }
  const data = await response.json();
  return { success: true, data };
};

export const baileysApi = {
  // Instances
  createInstance: async (name: string, webhookUrl?: string): Promise<ApiResponse<CreateInstanceResponse>> => {
    try {
      const response = await fetch(`${API_BASE_URL}/instance/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, webhookUrl }),
      });
      return handleResponse<CreateInstanceResponse>(response);
    } catch (error) {
      return { success: false, error: 'Erro de conexão com o servidor' };
    }
  },

  listInstances: async (): Promise<ApiResponse<InstanceStatusResponse[]>> => {
    try {
      const response = await fetch(`${API_BASE_URL}/instance/list`);
      return handleResponse<InstanceStatusResponse[]>(response);
    } catch (error) {
      return { success: false, error: 'Erro de conexão com o servidor' };
    }
  },

  getInstanceStatus: async (instanceId: string): Promise<ApiResponse<InstanceStatusResponse>> => {
    try {
      const response = await fetch(`${API_BASE_URL}/instance/${instanceId}/status`);
      return handleResponse<InstanceStatusResponse>(response);
    } catch (error) {
      return { success: false, error: 'Erro de conexão com o servidor' };
    }
  },

  deleteInstance: async (instanceId: string): Promise<ApiResponse<void>> => {
    try {
      const response = await fetch(`${API_BASE_URL}/instance/${instanceId}`, {
        method: 'DELETE',
      });
      return handleResponse<void>(response);
    } catch (error) {
      return { success: false, error: 'Erro de conexão com o servidor' };
    }
  },

  reconnectInstance: async (instanceId: string): Promise<ApiResponse<void>> => {
    try {
      const response = await fetch(`${API_BASE_URL}/instance/${instanceId}/reconnect`, {
        method: 'POST',
      });
      return handleResponse<void>(response);
    } catch (error) {
      return { success: false, error: 'Erro de conexão com o servidor' };
    }
  },

  // Messages
  sendMessage: async (
    instanceId: string,
    to: string,
    message: string,
    type: 'text' | 'image' | 'document' | 'audio' = 'text',
    mediaUrl?: string
  ): Promise<ApiResponse<SendMessageResponse>> => {
    try {
      const endpoint = type === 'text' ? 'send' : `send-${type}`;
      const body: Record<string, string> = { instanceId, to, message };
      if (mediaUrl) body.mediaUrl = mediaUrl;

      const response = await fetch(`${API_BASE_URL}/message/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return handleResponse<SendMessageResponse>(response);
    } catch (error) {
      return { success: false, error: 'Erro de conexão com o servidor' };
    }
  },
};

export const BAILEYS_WS_URL = 'ws://72.60.249.69:3001/ws';
