import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Instance, InstanceStatus } from '@/types/instance';
import { StatusBadge } from './StatusBadge';
import { QRCodeDisplay } from './QRCodeDisplay';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { 
  MoreVertical, 
  Trash2, 
  Settings, 
  Send, 
  Key, 
  Copy, 
  Check,
  Power,
  PowerOff
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { useInstances } from '@/contexts/InstanceContext';
import { useBaileysWebSocket } from '@/hooks/useBaileysWebSocket';
import { baileysApi } from '@/services/baileysApi';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface InstanceCardProps {
  instance: Instance;
  onSendMessage: (instance: Instance) => void;
  onViewDetails: (instance: Instance) => void;
}

export const InstanceCard: React.FC<InstanceCardProps> = ({ 
  instance, 
  onSendMessage,
  onViewDetails 
}) => {
  const { removeInstance, updateInstanceStatus, reconnectInstance } = useInstances();
  const [copied, setCopied] = useState(false);
  const [currentQR, setCurrentQR] = useState<string | undefined>(instance.qrCode);
  const [isPolling, setIsPolling] = useState(false);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isStaleRef = useRef(false); // Track if instance was marked as not found on server
  const isReconnectingRef = useRef(false); // Track if we're in reconnection grace period
  const reconnectAttemptRef = useRef(0); // Count 404 errors during reconnection
  const autoReconnectCountRef = useRef(0); // Limit auto-reconnects when QR expires
  const currentStatusRef = useRef(instance.status); // Track current status for callbacks
  const qrGracePeriodRef = useRef(false); // Grace period after QR shown to allow 515 reconnect
  const qrGraceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const statusPollIntervalRef = useRef<NodeJS.Timeout | null>(null); // Status polling interval
  const MAX_AUTO_RECONNECTS = 3;
  const QR_GRACE_PERIOD_MS = 30000; // 30 seconds grace period after QR is shown

  // Keep status ref in sync
  useEffect(() => {
    currentStatusRef.current = instance.status;
  }, [instance.status]);

  // HTTP polling for QR code as fallback
  const pollForQRCode = useCallback(async () => {
    // Guard: don't poll if instance.id is missing or instance is stale
    if (!instance.id || isStaleRef.current) return;
    // Also check ref for most current status
    if (currentStatusRef.current !== 'qr_pending' && currentStatusRef.current !== 'connecting') {
      console.log(`[InstanceCard] Parando poll - status atual: ${currentStatusRef.current}`);
      return;
    }
    
    try {
      const response = await baileysApi.getQRCode(instance.id);
      if (response.success && response.data?.qrCode) {
        console.log(`[InstanceCard] QR Code obtido via HTTP para ${instance.id}`);
        setCurrentQR(response.data.qrCode);
        updateInstanceStatus(instance.id, 'qr_pending', response.data.qrCode);
        // Reset reconnection state on success
        isReconnectingRef.current = false;
        reconnectAttemptRef.current = 0;
        
        // Start grace period when QR is received - allow 515 reconnect to complete
        qrGracePeriodRef.current = true;
        if (qrGraceTimeoutRef.current) clearTimeout(qrGraceTimeoutRef.current);
        qrGraceTimeoutRef.current = setTimeout(() => {
          qrGracePeriodRef.current = false;
          console.log(`[InstanceCard] Grace period expirou para ${instance.id}`);
        }, QR_GRACE_PERIOD_MS);
      } else if (response.error === 'Instance not found') {
        // During reconnection grace period, allow retries (wait for server to recreate)
        if (isReconnectingRef.current && reconnectAttemptRef.current < 15) {
          reconnectAttemptRef.current += 1;
          console.log(`[InstanceCard] Aguardando servidor recriar instância ${instance.id} (tentativa ${reconnectAttemptRef.current}/15)...`);
          return; // Keep polling, don't do anything else
        }
        
        // Too many retries without success - just stop polling, don't auto-reconnect
        // User should click "Conectar" manually
        console.log(`[InstanceCard] Instância ${instance.id} não encontrada após ${reconnectAttemptRef.current} tentativas`);
        isStaleRef.current = true;
        isReconnectingRef.current = false;
        reconnectAttemptRef.current = 0;
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        setIsPolling(false);
        setCurrentQR(undefined);
        updateInstanceStatus(instance.id, 'disconnected');
      } else {
        // QR not available yet, keep polling silently
        console.log(`[InstanceCard] QR ainda não disponível para ${instance.id}, aguardando...`);
      }
    } catch (error) {
      // Silently ignore errors during polling - QR might not be ready yet
      console.log('[InstanceCard] Aguardando QR code...');
    }
  }, [instance.id, updateInstanceStatus]);

  // Start polling when status is qr_pending and no QR code
  // Use refs to avoid race conditions with state updates
  const pollingActiveRef = useRef(false);
  const pollingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  useEffect(() => {
    // Guard: don't poll if instance.id is missing
    if (!instance.id) return;
    
    const shouldPoll = (instance.status === 'qr_pending' || instance.status === 'connecting') && !currentQR;
    
    if (shouldPoll && !pollingActiveRef.current) {
      pollingActiveRef.current = true;
      setIsPolling(true);
      
      // Clear any existing timers
      if (pollingTimeoutRef.current) clearTimeout(pollingTimeoutRef.current);
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      
      // Add initial delay to let server process reconnect request first
      pollingTimeoutRef.current = setTimeout(() => {
        if (!pollingActiveRef.current) return;
        pollForQRCode();
        // Then poll every 2 seconds
        pollIntervalRef.current = setInterval(() => {
          if (pollingActiveRef.current) pollForQRCode();
        }, 2000);
      }, 1500);
    } else if (!shouldPoll && pollingActiveRef.current) {
      pollingActiveRef.current = false;
      setIsPolling(false);
      if (pollingTimeoutRef.current) {
        clearTimeout(pollingTimeoutRef.current);
        pollingTimeoutRef.current = null;
      }
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    }

    return () => {
      // Only cleanup on unmount, not on dependency changes
    };
  }, [instance.id, instance.status, currentQR, pollForQRCode]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      pollingActiveRef.current = false;
      if (pollingTimeoutRef.current) clearTimeout(pollingTimeoutRef.current);
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (qrGraceTimeoutRef.current) clearTimeout(qrGraceTimeoutRef.current);
    };
  }, []);

  // WebSocket handlers
  const handleQRCode = useCallback((qr: string) => {
    console.log(`[InstanceCard] QR Code recebido via WebSocket para ${instance.id}`);
    setCurrentQR(qr);
    updateInstanceStatus(instance.id, 'qr_pending', qr);
    
    // Start grace period when QR is received - allow 515 reconnect to complete
    qrGracePeriodRef.current = true;
    if (qrGraceTimeoutRef.current) clearTimeout(qrGraceTimeoutRef.current);
    qrGraceTimeoutRef.current = setTimeout(() => {
      qrGracePeriodRef.current = false;
      console.log(`[InstanceCard] Grace period expirou para ${instance.id}`);
    }, QR_GRACE_PERIOD_MS);
  }, [instance.id, updateInstanceStatus]);

  const handleStatusChange = useCallback((status: string, phone?: string) => {
    console.log(`[InstanceCard] Status alterado para ${instance.id}: ${status}, status atual: ${currentStatusRef.current}`);
    const mappedStatus: InstanceStatus = 
      status === 'open' || status === 'connected' ? 'connected' :
      status === 'connecting' ? 'connecting' :
      status === 'qr' || status === 'qr_pending' ? 'qr_pending' : 'disconnected';
    
    // If connected successfully, stop ALL polling and reset counters
    if (mappedStatus === 'connected') {
      console.log(`[InstanceCard] Conexão bem-sucedida para ${instance.id}, parando polling`);
      autoReconnectCountRef.current = 0;
      isReconnectingRef.current = false;
      reconnectAttemptRef.current = 0;
      isStaleRef.current = false;
      qrGracePeriodRef.current = false; // Clear grace period on success
      if (qrGraceTimeoutRef.current) {
        clearTimeout(qrGraceTimeoutRef.current);
        qrGraceTimeoutRef.current = null;
      }
      // Clear status polling interval
      if (statusPollIntervalRef.current) {
        clearInterval(statusPollIntervalRef.current);
        statusPollIntervalRef.current = null;
      }
      pollingActiveRef.current = false;
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      if (pollingTimeoutRef.current) {
        clearTimeout(pollingTimeoutRef.current);
        pollingTimeoutRef.current = null;
      }
      setCurrentQR(undefined);
      setIsPolling(false);
      updateInstanceStatus(instance.id, mappedStatus, undefined, phone);
      toast({
        title: 'Conectado!',
        description: `WhatsApp conectado com sucesso.`,
      });
      return;
    }
    
    // If disconnected while previously connected, show notification
    if (mappedStatus === 'disconnected' && currentStatusRef.current === 'connected') {
      console.log(`[InstanceCard] Desconectado após estar conectado para ${instance.id}`);
      setCurrentQR(undefined);
      updateInstanceStatus(instance.id, mappedStatus);
      toast({
        title: 'Desconectado',
        description: 'O WhatsApp foi desconectado. O dispositivo pode ter sido removido.',
        variant: 'destructive',
      });
      return;
    }
    
    // If QR expired (disconnected while in qr_pending), check grace period first
    if (mappedStatus === 'disconnected' && currentStatusRef.current === 'qr_pending') {
      // During grace period, the server might be doing 515 reconnect - DON'T interfere
      if (qrGracePeriodRef.current) {
        console.log(`[InstanceCard] Ignorando desconexão durante grace period (515 reconnect em andamento) para ${instance.id}`);
        return; // Don't update status, don't reconnect - let server handle it
      }
      
      if (autoReconnectCountRef.current < MAX_AUTO_RECONNECTS) {
        autoReconnectCountRef.current += 1;
        console.log(`[InstanceCard] QR expirou para ${instance.id}, auto-reconectando... (tentativa ${autoReconnectCountRef.current}/${MAX_AUTO_RECONNECTS})`);
        isStaleRef.current = false;
        isReconnectingRef.current = true;
        reconnectAttemptRef.current = 0;
        setCurrentQR(undefined);
        reconnectInstance(instance.id);
        return; // Don't update to disconnected, stay in qr_pending
      } else {
        console.log(`[InstanceCard] Limite de auto-reconexão atingido para ${instance.id}`);
        autoReconnectCountRef.current = 0;
        toast({
          title: 'QR Code expirou',
          description: 'Clique em Conectar para tentar novamente.',
          variant: 'destructive',
        });
      }
    }
    
    updateInstanceStatus(instance.id, mappedStatus, undefined, phone);
  }, [instance.id, updateInstanceStatus, reconnectInstance]);

  // Track consecutive poll failures
  const pollFailureCountRef = useRef(0);
  const MAX_POLL_FAILURES = 5;

  // Status polling as fallback for WebSocket failures - polls continuously to sync state
  const pollInstanceStatus = useCallback(async () => {
    if (!instance.id) return;
    
    try {
      const response = await baileysApi.getInstanceStatus(instance.id);
      console.log(`[InstanceCard] Status poll para ${instance.id}:`, response);
      
      // Reset failure count on any response (even error responses from baileys)
      if (response.success) {
        pollFailureCountRef.current = 0;
        
        if (response.data) {
          const serverStatus = response.data.status;
          const phone = response.data.phone || undefined;
          
          // Map server status to our status type
          const mappedStatus: InstanceStatus = 
            serverStatus === 'connected' || serverStatus === 'open' ? 'connected' :
            serverStatus === 'connecting' ? 'connecting' :
            serverStatus === 'qr' || serverStatus === 'qr_pending' ? 'qr_pending' : 'disconnected';
          
          // Only update if different from current status
          if (mappedStatus !== currentStatusRef.current) {
            console.log(`[InstanceCard] Status mudou via polling: ${currentStatusRef.current} -> ${mappedStatus}`);
            
            if (mappedStatus === 'connected') {
              // Use the same connected logic as WebSocket handler
              handleStatusChange('connected', phone);
            } else {
              updateInstanceStatus(instance.id, mappedStatus, undefined, phone);
            }
          }
        }
      } else {
        // Server returned an error (like 500 or connection refused)
        pollFailureCountRef.current++;
        console.log(`[InstanceCard] Poll failure ${pollFailureCountRef.current}/${MAX_POLL_FAILURES} para ${instance.id}: ${response.error}`);
        
        // After too many failures, assume server is down
        if (pollFailureCountRef.current >= MAX_POLL_FAILURES && currentStatusRef.current === 'connected') {
          console.log(`[InstanceCard] Servidor indisponível, marcando como desconectado: ${instance.id}`);
          setCurrentQR(undefined);
          updateInstanceStatus(instance.id, 'disconnected');
          toast({
            title: 'Servidor indisponível',
            description: 'Não foi possível verificar o status da conexão.',
            variant: 'destructive',
          });
        }
      }
    } catch (error) {
      pollFailureCountRef.current++;
      console.log(`[InstanceCard] Erro no polling de status (${pollFailureCountRef.current}/${MAX_POLL_FAILURES}):`, error);
      
      if (pollFailureCountRef.current >= MAX_POLL_FAILURES && currentStatusRef.current === 'connected') {
        setCurrentQR(undefined);
        updateInstanceStatus(instance.id, 'disconnected');
      }
    }
  }, [instance.id, handleStatusChange, updateInstanceStatus]);

  // Start status polling when instance needs monitoring (not disconnected)
  useEffect(() => {
    // Poll when in qr_pending (waiting for scan) OR connected (to detect disconnections)
    const shouldPollStatus = instance.status === 'qr_pending' || instance.status === 'connected';
    
    if (shouldPollStatus && !statusPollIntervalRef.current) {
      console.log(`[InstanceCard] Iniciando status polling para ${instance.id} (status: ${instance.status})`);
      pollFailureCountRef.current = 0;
      // Poll every 3 seconds
      statusPollIntervalRef.current = setInterval(pollInstanceStatus, 3000);
      // Also poll immediately
      pollInstanceStatus();
    } else if (!shouldPollStatus && statusPollIntervalRef.current) {
      console.log(`[InstanceCard] Parando status polling para ${instance.id}`);
      clearInterval(statusPollIntervalRef.current);
      statusPollIntervalRef.current = null;
    }
    
    return () => {
      if (statusPollIntervalRef.current) {
        clearInterval(statusPollIntervalRef.current);
        statusPollIntervalRef.current = null;
      }
    };
  }, [instance.id, instance.status, pollInstanceStatus]);

  const handleError = useCallback((error: string) => {
    console.error(`[InstanceCard] Erro para ${instance.id}: ${error}`);
    toast({
      title: 'Erro na conexão',
      description: error,
      variant: 'destructive',
    });
  }, [instance.id]);

  // Keep WebSocket connected for ALL states except disconnected
  // This allows us to receive disconnection events (like 401 errors)
  const shouldConnect = !!instance.id && instance.status !== 'disconnected';
  
  const { isConnected: wsConnected } = useBaileysWebSocket({
    instanceId: instance.id,
    enabled: shouldConnect,
    onQRCode: handleQRCode,
    onStatusChange: handleStatusChange,
    onError: handleError,
  });

  const handleCopyApiKey = () => {
    navigator.clipboard.writeText(instance.apiKey);
    setCopied(true);
    toast({
      title: 'API Key copiada!',
      description: 'A chave foi copiada para a área de transferência.',
    });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleConnect = async () => {
    // Reset all flags when user manually connects
    isStaleRef.current = false;
    isReconnectingRef.current = true; // Enable grace period for 404 errors
    reconnectAttemptRef.current = 0;
    autoReconnectCountRef.current = 0; // Reset auto-reconnect counter on manual connect
    setCurrentQR(undefined); // Clear current QR to trigger polling
    await reconnectInstance(instance.id);
    toast({
      title: 'Gerando QR Code...',
      description: 'Escaneie o código com seu WhatsApp.',
    });
  };

  const handleDisconnect = () => {
    setCurrentQR(undefined);
    updateInstanceStatus(instance.id, 'disconnected');
    toast({
      title: 'Desconectado',
      description: 'A instância foi desconectada.',
      variant: 'destructive',
    });
  };

  const handleDelete = async () => {
    const success = await removeInstance(instance.id);
    if (success) {
      toast({
        title: 'Instância removida',
        description: `A instância "${instance.name}" foi removida.`,
        variant: 'destructive',
      });
    }
  };

  const handleRefreshQR = async () => {
    // Guard: don't refresh if instance is disconnected or stale
    if (instance.status === 'disconnected' || isStaleRef.current) {
      console.log('[InstanceCard] Ignorando refresh para instância desconectada/stale');
      return;
    }
    // Enable grace period for refresh as well
    isReconnectingRef.current = true;
    reconnectAttemptRef.current = 0;
    setCurrentQR(undefined); // Clear current QR to trigger polling
    await reconnectInstance(instance.id);
  };

  return (
    <Card className={cn(
      'overflow-hidden transition-all duration-300 hover:shadow-lg',
      instance.status === 'connected' && 'border-success/30',
      instance.status === 'qr_pending' && 'border-info/30'
    )}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg font-semibold">{instance.name}</CardTitle>
            {instance.phone && (
              <p className="text-sm text-muted-foreground">{instance.phone}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={instance.status} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onViewDetails(instance)}>
                  <Settings className="mr-2 h-4 w-4" />
                  Configurações
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleCopyApiKey}>
                  <Key className="mr-2 h-4 w-4" />
                  Copiar API Key
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {instance.status === 'connected' ? (
                  <DropdownMenuItem onClick={handleDisconnect}>
                    <PowerOff className="mr-2 h-4 w-4" />
                    Desconectar
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onClick={handleConnect}>
                    <Power className="mr-2 h-4 w-4" />
                    Conectar
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  onClick={handleDelete}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Remover
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {instance.status === 'qr_pending' && (
          <div className="flex flex-col items-center py-4">
            {(currentQR || instance.qrCode) ? (
              <QRCodeDisplay 
                qrCode={currentQR || instance.qrCode || ''} 
                onRefresh={handleRefreshQR}
              />
            ) : (
              <div className="flex flex-col items-center py-8 text-center">
                <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin mb-4" />
                <p className="text-sm text-muted-foreground">Aguardando QR Code...</p>
              </div>
            )}
          </div>
        )}

        {instance.status === 'connecting' && (
          <div className="flex flex-col items-center py-8 text-center">
            <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin mb-4" />
            <p className="text-sm text-muted-foreground">Conectando ao WhatsApp...</p>
          </div>
        )}

        {instance.status === 'connected' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
              <Key className="w-4 h-4 text-muted-foreground" />
              <code className="text-xs flex-1 truncate">{instance.apiKey}</code>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-6 w-6"
                onClick={handleCopyApiKey}
              >
                {copied ? (
                  <Check className="h-3 w-3 text-success" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </Button>
            </div>
            <Button 
              className="w-full gap-2" 
              onClick={() => onSendMessage(instance)}
            >
              <Send className="w-4 h-4" />
              Enviar Mensagem
            </Button>
          </div>
        )}

        {instance.status === 'disconnected' && (
          <div className="text-center py-4">
            <p className="text-sm text-muted-foreground mb-3">
              Esta instância está desconectada
            </p>
            <Button variant="outline" onClick={handleConnect} className="gap-2">
              <Power className="w-4 h-4" />
              Conectar
            </Button>
          </div>
        )}

        <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border">
          <span>Criado em {instance.createdAt.toLocaleDateString('pt-BR')}</span>
          {instance.lastSeen && (
            <span>Visto: {instance.lastSeen.toLocaleTimeString('pt-BR')}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
