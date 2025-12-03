import { useEffect, useRef, useCallback, useState } from 'react';
import { BAILEYS_WS_URL } from '@/services/baileysApi';

interface WebSocketMessage {
  // Server can send either 'type' or 'event' field
  type?: 'qr' | 'status' | 'message' | 'error';
  event?: 'qr' | 'status' | 'message' | 'error';
  // Server sends 'qrCode', we also accept 'qr'
  qr?: string;
  qrCode?: string;
  status?: string;
  phone?: string;
  message?: unknown;
  data?: unknown;
  error?: string;
}

interface UseBaileysWebSocketProps {
  instanceId: string | null;
  enabled?: boolean;
  onQRCode?: (qr: string) => void;
  onStatusChange?: (status: string, phone?: string) => void;
  onMessage?: (message: unknown) => void;
  onError?: (error: string) => void;
}

const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY = 5000;

export const useBaileysWebSocket = ({
  instanceId,
  enabled = true,
  onQRCode,
  onStatusChange,
  onMessage,
  onError,
}: UseBaileysWebSocketProps) => {
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const reconnectAttemptsRef = useRef(0);
  const isManualDisconnectRef = useRef(false);
  const isConnectingRef = useRef(false);
  const lastInstanceIdRef = useRef<string | null>(null);

  const connect = useCallback(() => {
    if (!instanceId || !enabled) return;
    
    // Prevent multiple simultaneous connection attempts
    if (isConnectingRef.current && lastInstanceIdRef.current === instanceId) {
      console.log(`[WebSocket] Já conectando para instância: ${instanceId}, ignorando`);
      return;
    }

    // If already connected to the same instance, don't reconnect
    if (wsRef.current?.readyState === WebSocket.OPEN && lastInstanceIdRef.current === instanceId) {
      console.log(`[WebSocket] Já conectado para instância: ${instanceId}`);
      return;
    }

    // Close existing connection if connecting to different instance
    if (wsRef.current && lastInstanceIdRef.current !== instanceId) {
      wsRef.current.close();
    }

    // Reset flags
    isManualDisconnectRef.current = false;
    isConnectingRef.current = true;
    lastInstanceIdRef.current = instanceId;

    console.log(`[WebSocket] Conectando para instância: ${instanceId}`);
    
    try {
      const ws = new WebSocket(`${BAILEYS_WS_URL}?instanceId=${instanceId}`);

      ws.onopen = () => {
        console.log(`[WebSocket] Conectado para instância: ${instanceId}`);
        setIsConnected(true);
        isConnectingRef.current = false;
        reconnectAttemptsRef.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const data: WebSocketMessage = JSON.parse(event.data);
          console.log(`[WebSocket] Mensagem recebida:`, data);

          // Support both 'type' and 'event' field names
          const messageType = data.type || data.event;
          // Support both 'qrCode' and 'qr' field names
          const qrCode = data.qrCode || data.qr;

          switch (messageType) {
            case 'qr':
              if (qrCode && onQRCode) {
                onQRCode(qrCode);
              }
              break;
            case 'status':
              if (data.status && onStatusChange) {
                onStatusChange(data.status, data.phone);
              }
              break;
            case 'message':
              const messageData = data.data || data.message;
              if (messageData && onMessage) {
                onMessage(messageData);
              }
              break;
            case 'error':
              if (data.error && onError) {
                onError(data.error);
              }
              break;
          }
        } catch (error) {
          console.error('[WebSocket] Erro ao parsear mensagem:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('[WebSocket] Erro:', error);
        isConnectingRef.current = false;
      };

      ws.onclose = () => {
        console.log(`[WebSocket] Desconectado da instância: ${instanceId}`);
        setIsConnected(false);
        isConnectingRef.current = false;

        // Don't reconnect if manually disconnected
        if (isManualDisconnectRef.current) {
          console.log('[WebSocket] Desconexão manual, não reconectando');
          return;
        }

        // Don't auto-reconnect - let the user trigger reconnection manually
        // This prevents the infinite reconnection loop
        console.log('[WebSocket] Conexão fechada. Use o botão Conectar para reconectar.');
      };

      wsRef.current = ws;
    } catch (error) {
      console.error('[WebSocket] Erro ao criar conexão:', error);
      isConnectingRef.current = false;
    }
  }, [instanceId, enabled, onQRCode, onStatusChange, onMessage, onError]);

  const disconnect = useCallback(() => {
    isManualDisconnectRef.current = true;
    isConnectingRef.current = false;
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
    reconnectAttemptsRef.current = 0;
  }, []);

  // Use refs for stable effect
  const enabledRef = useRef(enabled);
  const instanceIdRef = useRef(instanceId);
  
  useEffect(() => {
    enabledRef.current = enabled;
    instanceIdRef.current = instanceId;
  }, [enabled, instanceId]);

  useEffect(() => {
    // Only connect if enabled and instanceId exists
    if (instanceId && enabled) {
      // Small delay to prevent rapid reconnections during re-renders
      const connectTimeout = setTimeout(() => {
        if (enabledRef.current && instanceIdRef.current === instanceId) {
          connect();
        }
      }, 100);
      
      return () => {
        clearTimeout(connectTimeout);
      };
    } else {
      disconnect();
    }

    return () => {
      // Don't disconnect on cleanup if we're still supposed to be connected
      // This prevents disconnect during re-renders
    };
  }, [instanceId, enabled]);

  return { isConnected, disconnect, reconnect: connect };
};
