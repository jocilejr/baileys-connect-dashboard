import React, { useState } from 'react';
import { Instance } from '@/types/instance';
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
  const { removeInstance, updateInstanceStatus } = useInstances();
  const [copied, setCopied] = useState(false);

  const handleCopyApiKey = () => {
    navigator.clipboard.writeText(instance.apiKey);
    setCopied(true);
    toast({
      title: 'API Key copiada!',
      description: 'A chave foi copiada para a área de transferência.',
    });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleConnect = () => {
    updateInstanceStatus(instance.id, 'qr_pending', `2@${Date.now()}`);
    toast({
      title: 'Gerando QR Code...',
      description: 'Escaneie o código com seu WhatsApp.',
    });
  };

  const handleDisconnect = () => {
    updateInstanceStatus(instance.id, 'disconnected');
    toast({
      title: 'Desconectado',
      description: 'A instância foi desconectada.',
      variant: 'destructive',
    });
  };

  const handleDelete = () => {
    removeInstance(instance.id);
    toast({
      title: 'Instância removida',
      description: `A instância "${instance.name}" foi removida.`,
      variant: 'destructive',
    });
  };

  const handleRefreshQR = () => {
    updateInstanceStatus(instance.id, 'qr_pending', `2@${Date.now()}`);
  };

  // Simulate connection after QR scan (demo purposes)
  const simulateConnection = () => {
    updateInstanceStatus(instance.id, 'connecting');
    setTimeout(() => {
      updateInstanceStatus(instance.id, 'connected', undefined, '+55 11 98765-4321');
      toast({
        title: 'Conectado!',
        description: 'WhatsApp conectado com sucesso.',
      });
    }, 2000);
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
        {instance.status === 'qr_pending' && instance.qrCode && (
          <div className="flex flex-col items-center py-4">
            <QRCodeDisplay 
              qrCode={instance.qrCode} 
              onRefresh={handleRefreshQR}
            />
            <Button 
              variant="success" 
              size="sm" 
              className="mt-4"
              onClick={simulateConnection}
            >
              Simular Conexão (Demo)
            </Button>
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
