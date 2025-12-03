import React from 'react';
import { cn } from '@/lib/utils';
import { InstanceStatus } from '@/types/instance';
import { Wifi, WifiOff, Loader2, QrCode } from 'lucide-react';

interface StatusBadgeProps {
  status: InstanceStatus;
  className?: string;
}

const statusConfig: Record<InstanceStatus, {
  label: string;
  className: string;
  icon: React.ReactNode;
}> = {
  connected: {
    label: 'Conectado',
    className: 'bg-success/20 text-success border-success/30',
    icon: <Wifi className="w-3 h-3" />,
  },
  disconnected: {
    label: 'Desconectado',
    className: 'bg-destructive/20 text-destructive border-destructive/30',
    icon: <WifiOff className="w-3 h-3" />,
  },
  connecting: {
    label: 'Conectando',
    className: 'bg-warning/20 text-warning border-warning/30',
    icon: <Loader2 className="w-3 h-3 animate-spin" />,
  },
  qr_pending: {
    label: 'Aguardando QR',
    className: 'bg-info/20 text-info border-info/30',
    icon: <QrCode className="w-3 h-3" />,
  },
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, className }) => {
  const config = statusConfig[status];

  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border',
      config.className,
      className
    )}>
      {config.icon}
      {config.label}
    </span>
  );
};
