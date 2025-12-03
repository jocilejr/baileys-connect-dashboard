import React, { useEffect, useState, useRef } from 'react';
import { cn } from '@/lib/utils';
import { RefreshCw, Smartphone } from 'lucide-react';
import { Button } from './ui/button';

interface QRCodeDisplayProps {
  qrCode: string;
  onRefresh?: () => void;
  className?: string;
}

export const QRCodeDisplay: React.FC<QRCodeDisplayProps> = ({ 
  qrCode, 
  onRefresh,
  className 
}) => {
  const [countdown, setCountdown] = useState(60);
  const lastQRRef = useRef(qrCode);

  // Reset countdown when QR code changes (new QR received from server)
  useEffect(() => {
    if (qrCode !== lastQRRef.current) {
      lastQRRef.current = qrCode;
      setCountdown(60);
      console.log('[QRCodeDisplay] Novo QR recebido, countdown resetado');
    }
  }, [qrCode]);

  // Countdown timer - auto refresh when expires
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          console.log('[QRCodeDisplay] QR expirou, solicitando novo...');
          onRefresh?.();
          return 60; // Reset countdown while waiting for new QR
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [onRefresh]);

  // Check if qrCode is a data URL (already an image)
  const isDataUrl = qrCode.startsWith('data:');

  return (
    <div className={cn('flex flex-col items-center gap-4', className)}>
      <div className="relative p-4 bg-card rounded-2xl border border-border shadow-lg">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent rounded-2xl" />
        <div className="relative bg-white p-4 rounded-xl">
          {isDataUrl ? (
            <img 
              key={qrCode.substring(0, 100)}  // Force re-render on QR change
              src={qrCode} 
              alt="QR Code WhatsApp" 
              className="w-[200px] h-[200px] rounded-lg"
            />
          ) : (
            <div className="w-[200px] h-[200px] flex items-center justify-center text-muted-foreground text-sm">
              QR Code inválido
            </div>
          )}
        </div>
        <div className={cn(
          "absolute -top-2 -right-2 text-xs font-bold px-2 py-1 rounded-full",
          countdown > 10 
            ? "bg-primary text-primary-foreground" 
            : "bg-destructive text-destructive-foreground animate-pulse"
        )}>
          {countdown}s
        </div>
      </div>
      
      <div className="text-center space-y-2">
        <div className="flex items-center justify-center gap-2 text-muted-foreground text-sm">
          <Smartphone className="w-4 h-4" />
          <span>Escaneie com o WhatsApp</span>
        </div>
        <ol className="text-xs text-muted-foreground space-y-1">
          <li>1. Abra o WhatsApp no celular</li>
          <li>2. Toque em Menu &gt; Aparelhos conectados</li>
          <li>3. Toque em Conectar um aparelho</li>
          <li>4. Aponte a câmera para este código</li>
        </ol>
      </div>

      <Button variant="outline" size="sm" onClick={onRefresh} className="gap-2">
        <RefreshCw className="w-4 h-4" />
        Atualizar QR Code
      </Button>
    </div>
  );
};