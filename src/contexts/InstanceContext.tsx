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
    try {
      const response = await baileysApi.listInstances();
      if (response.success && response.data) {
        const serverInstances: Instance[] = response.data.map((inst) => ({
          // Server returns 'id' field, not 'instanceId'
          id: inst.id || inst.instanceId,
          name: inst.name || inst.id || inst.instanceId,
          phone: inst.phone,
          status: (inst.status as InstanceStatus) || 'disconnected',
          createdAt: new Date(),
          apiKey: generateApiKey(),
        }));
        setInstances(serverInstances);
      }
    } catch (error) {
      console.error('Erro ao carregar instâncias:', error);
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
    setInstances(prev => prev.map(instance => {
      if (instance.id === id) {
        return {
          ...instance,
          status,
          qrCode: qrCode || instance.qrCode,
          phone: phone || instance.phone,
          lastSeen: status === 'connected' ? new Date() : instance.lastSeen,
        };
      }
      return instance;
    }));
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
