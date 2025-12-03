import React, { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Plus, Loader2 } from 'lucide-react';
import { useInstances } from '@/contexts/InstanceContext';
import { toast } from '@/hooks/use-toast';

interface CreateInstanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const CreateInstanceDialog: React.FC<CreateInstanceDialogProps> = ({
  open,
  onOpenChange,
}) => {
  const [name, setName] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { addInstance } = useInstances();

  const handleCreate = async () => {
    if (!name.trim()) {
      toast({
        title: 'Nome obrigatório',
        description: 'Digite um nome para a instância.',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);

    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));

    const instance = addInstance(name.trim());

    toast({
      title: 'Instância criada!',
      description: `"${name}" foi criada. Escaneie o QR Code para conectar.`,
    });

    setName('');
    setWebhookUrl('');
    setIsLoading(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="w-5 h-5 text-primary" />
            Nova Instância
          </DialogTitle>
          <DialogDescription>
            Crie uma nova instância para conectar um número do WhatsApp.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome da instância *</Label>
            <Input
              id="name"
              placeholder="Ex: Atendimento, Vendas, Suporte..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="webhook">Webhook URL (opcional)</Label>
            <Input
              id="webhook"
              placeholder="https://seu-servidor.com/webhook"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              URL para receber eventos de mensagens recebidas
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleCreate} disabled={isLoading} className="gap-2">
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            Criar Instância
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
