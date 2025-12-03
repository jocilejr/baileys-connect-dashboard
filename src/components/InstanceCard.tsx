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

  // HTTP polling for QR code as fallback
  const pollForQRCode = useCallback(async () => {
    // Guard: don't poll if instance.id is missing
    if (!instance.id) return;
    if (instance.status !== 'qr_pending' && instance.status !== 'connecting') return;
    
    try {
      const response = await baileysApi.getQRCode(instance.id);
      if (response.success && response.data?.qrCode) {
        console.log(`[InstanceCard] QR Code obtido via HTTP para ${instance.id}`);
        setCurrentQR(response.data.qrCode);
        updateInstanceStatus(instance.id, 'qr_pending', response.data.qrCode);
      } else if (response.error === 'Instance not found') {
        // Instance was removed from server (server restart, etc)
        console.log(`[InstanceCard] Instância ${instance.id} não encontrada no servidor`);
        updateInstanceStatus(instance.id, 'disconnected');
        setIsPolling(false);
      } else {
        // QR not available yet, keep polling silently
        console.log(`[InstanceCard] QR ainda não disponível para ${instance.id}, aguardando...`);
      }
    } catch (error) {
      // Silently ignore errors during polling - QR might not be ready yet
      console.log('[InstanceCard] Aguardando QR code...');
    }
  }, [instance.id, instance.status, updateInstanceStatus]);

  // Start polling when status is qr_pending and no QR code
  useEffect(() => {
    // Guard: don't poll if instance.id is missing
    if (!instance.id) return;
    
    const shouldPoll = (instance.status === 'qr_pending' || instance.status === 'connecting') && !currentQR;
    
    if (shouldPoll && !isPolling) {
      setIsPolling(true);
      // Poll immediately
      pollForQRCode();
      // Then poll every 2 seconds
      pollIntervalRef.current = setInterval(pollForQRCode, 2000);
    } else if (!shouldPoll && isPolling) {
      setIsPolling(false);
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [instance.status, currentQR, isPolling, pollForQRCode]);

  // WebSocket handlers
  const handleQRCode = useCallback((qr: string) => {
    console.log(`[InstanceCard] QR Code recebido via WebSocket para ${instance.id}`);
    setCurrentQR(qr);
    updateInstanceStatus(instance.id, 'qr_pending', qr);
  }, [instance.id, updateInstanceStatus]);

  const handleStatusChange = useCallback((status: string, phone?: string) => {
    console.log(`[InstanceCard] Status alterado para ${instance.id}: ${status}`);
    const mappedStatus: InstanceStatus = 
      status === 'open' || status === 'connected' ? 'connected' :
      status === 'connecting' ? 'connecting' :
      status === 'qr' || status === 'qr_pending' ? 'qr_pending' : 'disconnected';
    
    updateInstanceStatus(instance.id, mappedStatus, undefined, phone);
    
    if (mappedStatus === 'connected') {
      setCurrentQR(undefined);
      toast({
        title: 'Conectado!',
        description: `WhatsApp conectado com sucesso.`,
      });
    }
  }, [instance.id, updateInstanceStatus]);

  const handleError = useCallback((error: string) => {
    console.error(`[InstanceCard] Erro para ${instance.id}: ${error}`);
    toast({
      title: 'Erro na conexão',
      description: error,
      variant: 'destructive',
    });
  }, [instance.id]);

  // Keep WebSocket connected while waiting for QR or during connection process
  // Only disconnect when fully connected or explicitly disconnected
  const shouldConnect = !!instance.id && instance.status !== 'connected' && instance.status !== 'disconnected';
  
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
