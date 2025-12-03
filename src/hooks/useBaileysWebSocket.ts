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

  const connect = useCallback(() => {
    if (!instanceId || !enabled) return;

    // Close existing connection
    if (wsRef.current) {
      wsRef.current.close();
    }

    // Reset manual disconnect flag
    isManualDisconnectRef.current = false;

    console.log(`[WebSocket] Conectando para instância: ${instanceId}`);
    
    try {
      const ws = new WebSocket(`${BAILEYS_WS_URL}?instanceId=${instanceId}`);

      ws.onopen = () => {
        console.log(`[WebSocket] Conectado para instância: ${instanceId}`);
        setIsConnected(true);
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
      };

      ws.onclose = () => {
        console.log(`[WebSocket] Desconectado da instância: ${instanceId}`);
        setIsConnected(false);

        // Don't reconnect if manually disconnected or max attempts reached
        if (isManualDisconnectRef.current) {
          console.log('[WebSocket] Desconexão manual, não reconectando');
          return;
        }

        if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
          console.log('[WebSocket] Máximo de tentativas atingido, parando reconexão');
          onError?.('Não foi possível conectar ao WebSocket. O servidor pode estar indisponível.');
          return;
        }

        // Auto-reconnect with exponential backoff
        const delay = Math.min(3000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
        reconnectAttemptsRef.current++;
        
        console.log(`[WebSocket] Tentando reconectar em ${delay}ms (tentativa ${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS})`);
        
        reconnectTimeoutRef.current = setTimeout(() => {
          if (instanceId && enabled && !isManualDisconnectRef.current) {
            connect();
          }
        }, delay);
      };

      wsRef.current = ws;
    } catch (error) {
      console.error('[WebSocket] Erro ao criar conexão:', error);
    }
  }, [instanceId, enabled, onQRCode, onStatusChange, onMessage, onError]);

  const disconnect = useCallback(() => {
    isManualDisconnectRef.current = true;
    
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

  useEffect(() => {
    if (instanceId && enabled) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [instanceId, enabled]);

  return { isConnected, disconnect, reconnect: connect };
};
