import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { Instance, InstanceStatus } from '@/types/instance';
import { baileysApi } from '@/services/baileysApi';
import { toast } from '@/hooks/use-toast';

interface InstanceContextType {
  instances: Instance[];
  isLoading: boolean;
  addInstance: (name: string, webhookUrl?: string) => Promise<Instance | null>;
  removeInstance: (id: string) => Promise<boolean>;
  updateInstanceStatus: (id: string, status: InstanceStatus, qrCode?: string, phone?: string) => void;
  getInstanceById: (id: string) => Instance | undefined;
  reconnectInstance: (id: string) => Promise<void>;
  refreshInstances: () => Promise<void>;
}

const InstanceContext = createContext<InstanceContextType | undefined>(undefined);

export const useInstances = () => {
  const context = useContext(InstanceContext);
  if (!context) {
    throw new Error('useInstances must be used within an InstanceProvider');
  }
  return context;
};

const generateApiKey = () => {
  return 'wapi_' + Array.from({ length: 32 }, () => 
    Math.random().toString(36).charAt(2)
  ).join('');
};

interface InstanceProviderProps {
  children: ReactNode;
}

export const InstanceProvider: React.FC<InstanceProviderProps> = ({ children }) => {
  const [instances, setInstances] = useState<Instance[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load instances from server on mount
  const refreshInstances = useCallback(async () => {
    console.log('[InstanceContext] Carregando instâncias do servidor...');
    try {
      const response = await baileysApi.listInstances();
      console.log('[InstanceContext] Resposta do servidor:', JSON.stringify(response));
      
      if (response.success && response.data) {
        // Se o servidor retornar lista vazia, limpar instâncias locais
        if (response.data.length === 0) {
          console.log('[InstanceContext] Servidor retornou lista vazia, limpando estado local');
          setInstances([]);
          return;
        }
        
        const serverInstances: Instance[] = response.data.map((inst) => {
          const id = inst.id || inst.instanceId || '';
          // Map server status to frontend status - if not connected on server, show as disconnected
          let mappedStatus: InstanceStatus = 'disconnected';
          if (inst.status === 'connected') {
            mappedStatus = 'connected';
          } else if (inst.status === 'qr_pending' || inst.status === 'connecting') {
            mappedStatus = inst.status as InstanceStatus;
          }
          
          console.log(`[InstanceContext] Processando instância: ${id}, status servidor: ${inst.status}, status mapeado: ${mappedStatus}`);
          return {
            id,
            name: inst.name || id,
            phone: inst.phone || undefined,
            status: mappedStatus,
            createdAt: new Date(),
            apiKey: generateApiKey(),
          };
        });
        console.log('[InstanceContext] Instâncias carregadas:', serverInstances.map(i => ({ id: i.id, status: i.status, phone: i.phone })));
        setInstances(serverInstances);
      } else {
        // Erro ou sem dados - limpar estado local
        console.log('[InstanceContext] Sem dados do servidor, limpando estado local');
        setInstances([]);
      }
    } catch (error) {
      console.error('[InstanceContext] Erro ao carregar instâncias:', error);
      // Em caso de erro, limpar estado para evitar dados inconsistentes
      setInstances([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshInstances();
  }, [refreshInstances]);

  const addInstance = async (name: string, webhookUrl?: string): Promise<Instance | null> => {
    const response = await baileysApi.createInstance(name, webhookUrl);
    
    if (!response.success || !response.data) {
      toast({
        title: 'Erro ao criar instância',
        description: response.error || 'Erro desconhecido',
        variant: 'destructive',
      });
      return null;
    }

    const newInstance: Instance = {
      id: response.data.instanceId,
      name: response.data.name || name,
      status: 'qr_pending',
      createdAt: new Date(),
      apiKey: generateApiKey(),
      webhookUrl,
    };
    
    setInstances(prev => [...prev, newInstance]);
    return newInstance;
  };

  const removeInstance = async (id: string): Promise<boolean> => {
    // Guard: don't attempt to delete if id is missing
    if (!id) {
      console.error('Tentativa de remover instância sem ID');
      return false;
    }
    
    const response = await baileysApi.deleteInstance(id);
    
    // If instance not found on server (404), still remove from frontend
    // This handles cases where server restarted and lost instance in memory
    if (!response.success && !response.error?.includes('not found')) {
      toast({
        title: 'Erro ao remover instância',
        description: response.error || 'Erro desconhecido',
        variant: 'destructive',
      });
      return false;
    }

    // Always remove from frontend state
    setInstances(prev => prev.filter(instance => instance.id !== id));
    return true;
  };

  const updateInstanceStatus = (
    id: string, 
    status: InstanceStatus, 
    qrCode?: string, 
    phone?: string
  ) => {
    console.log(`[InstanceContext] Atualizando instância ${id} para status: ${status}`);
    setInstances(prev => {
      const updated = prev.map(instance => {
        if (instance.id === id) {
          // Clear phone when disconnecting or waiting for QR
          const shouldClearPhone = status === 'disconnected' || status === 'qr_pending' || status === 'connecting';
          const newInstance = {
            ...instance,
            status,
            qrCode: qrCode || (shouldClearPhone ? undefined : instance.qrCode),
            phone: shouldClearPhone ? undefined : (phone || instance.phone),
            lastSeen: status === 'connected' ? new Date() : instance.lastSeen,
          };
          console.log(`[InstanceContext] Instância ${id} atualizada:`, { status: newInstance.status, phone: newInstance.phone });
          return newInstance;
        }
        return instance;
      });
      return updated;
    });
  };

  const reconnectInstance = async (id: string) => {
    updateInstanceStatus(id, 'qr_pending');
    
    const response = await baileysApi.reconnectInstance(id);
    
    if (!response.success) {
      toast({
        title: 'Erro ao reconectar',
        description: response.error || 'Erro desconhecido',
        variant: 'destructive',
      });
      updateInstanceStatus(id, 'disconnected');
    }
  };

  const getInstanceById = (id: string) => {
    return instances.find(instance => instance.id === id);
  };

  return (
    <InstanceContext.Provider value={{
      instances,
      isLoading,
      addInstance,
      removeInstance,
      updateInstanceStatus,
      getInstanceById,
      reconnectInstance,
      refreshInstances,
    }}>
      {children}
    </InstanceContext.Provider>
  );
};
