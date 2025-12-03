import { useEffect, useRef, useCallback, useState } from 'react';
import { BAILEYS_WS_URL } from '@/services/baileysApi';

interface WebSocketMessage {
  event: 'qr' | 'status' | 'message' | 'error';
  qr?: string;
  status?: string;
  phone?: string;
  message?: unknown;
  error?: string;
}

interface UseBaileysWebSocketProps {
  instanceId: string | null;
  onQRCode?: (qr: string) => void;
  onStatusChange?: (status: string, phone?: string) => void;
  onMessage?: (message: unknown) => void;
  onError?: (error: string) => void;
}

export const useBaileysWebSocket = ({
  instanceId,
  onQRCode,
  onStatusChange,
  onMessage,
  onError,
}: UseBaileysWebSocketProps) => {
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();

  const connect = useCallback(() => {
    if (!instanceId) return;

    // Close existing connection
    if (wsRef.current) {
      wsRef.current.close();
    }

    console.log(`[WebSocket] Conectando para instância: ${instanceId}`);
    const ws = new WebSocket(`${BAILEYS_WS_URL}?instanceId=${instanceId}`);

    ws.onopen = () => {
      console.log(`[WebSocket] Conectado para instância: ${instanceId}`);
      setIsConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const data: WebSocketMessage = JSON.parse(event.data);
        console.log(`[WebSocket] Mensagem recebida:`, data);

        switch (data.event) {
          case 'qr':
            if (data.qr && onQRCode) {
              onQRCode(data.qr);
            }
            break;
          case 'status':
            if (data.status && onStatusChange) {
              onStatusChange(data.status, data.phone);
            }
            break;
          case 'message':
            if (data.message && onMessage) {
              onMessage(data.message);
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
      onError?.('Erro na conexão WebSocket');
    };

    ws.onclose = () => {
      console.log(`[WebSocket] Desconectado da instância: ${instanceId}`);
      setIsConnected(false);

      // Auto-reconnect after 3 seconds
      reconnectTimeoutRef.current = setTimeout(() => {
        if (instanceId) {
          console.log('[WebSocket] Tentando reconectar...');
          connect();
        }
      }, 3000);
    };

    wsRef.current = ws;
  }, [instanceId, onQRCode, onStatusChange, onMessage, onError]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
  }, []);

  useEffect(() => {
    if (instanceId) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [instanceId, connect, disconnect]);

  return { isConnected, disconnect, reconnect: connect };
};
