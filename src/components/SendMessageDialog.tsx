import React, { useState } from 'react';
import { Instance } from '@/types/instance';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { Send, Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { baileysApi } from '@/services/baileysApi';

interface SendMessageDialogProps {
  instance: Instance | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const SendMessageDialog: React.FC<SendMessageDialogProps> = ({
  instance,
  open,
  onOpenChange,
}) => {
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'text' | 'image' | 'document' | 'audio'>('text');
  const [mediaUrl, setMediaUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSend = async () => {
    if (!phone || !message) {
      toast({
        title: 'Campos obrigatórios',
        description: 'Preencha o número e a mensagem.',
        variant: 'destructive',
      });
      return;
    }

    if (!instance) {
      toast({
        title: 'Erro',
        description: 'Nenhuma instância selecionada.',
        variant: 'destructive',
      });
      return;
    }

    // Format phone number - remove non-digits
    const formattedPhone = phone.replace(/\D/g, '');
    
    if (formattedPhone.length < 10) {
      toast({
        title: 'Número inválido',
        description: 'Digite um número de telefone válido.',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);

    const response = await baileysApi.sendMessage(
      instance.id,
      formattedPhone,
      message,
      messageType,
      messageType !== 'text' ? mediaUrl : undefined
    );

    if (response.success) {
      toast({
        title: 'Mensagem enviada!',
        description: `Mensagem enviada para ${phone}`,
      });
      setPhone('');
      setMessage('');
      setMediaUrl('');
      setMessageType('text');
      onOpenChange(false);
    } else {
      toast({
        title: 'Erro ao enviar',
        description: response.error || 'Não foi possível enviar a mensagem.',
        variant: 'destructive',
      });
    }

    setIsLoading(false);
  };

  const formatPhone = (value: string) => {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length <= 2) return numbers;
    if (numbers.length <= 7) return `(${numbers.slice(0, 2)}) ${numbers.slice(2)}`;
    if (numbers.length <= 11) return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 7)}-${numbers.slice(7)}`;
    return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 7)}-${numbers.slice(7, 11)}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Enviar Mensagem</DialogTitle>
          <DialogDescription>
            {instance?.name} • {instance?.phone || 'Sem número'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="phone">Número do destinatário</Label>
            <Input
              id="phone"
              placeholder="(11) 99999-9999"
              value={phone}
              onChange={(e) => setPhone(formatPhone(e.target.value))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="type">Tipo de mensagem</Label>
            <Select value={messageType} onValueChange={(v) => setMessageType(v as typeof messageType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="text">Texto</SelectItem>
                <SelectItem value="image">Imagem</SelectItem>
                <SelectItem value="document">Documento</SelectItem>
                <SelectItem value="audio">Áudio</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {messageType !== 'text' && (
            <div className="space-y-2">
              <Label htmlFor="mediaUrl">URL da mídia</Label>
              <Input
                id="mediaUrl"
                placeholder="https://exemplo.com/arquivo.jpg"
                value={mediaUrl}
                onChange={(e) => setMediaUrl(e.target.value)}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="message">
              {messageType === 'text' ? 'Mensagem' : 'Legenda (opcional)'}
            </Label>
            <Textarea
              id="message"
              placeholder="Digite sua mensagem..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSend} disabled={isLoading} className="gap-2">
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
