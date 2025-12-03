import React, { createContext, useContext, useState, ReactNode } from 'react';
import { Instance, InstanceStatus } from '@/types/instance';

interface InstanceContextType {
  instances: Instance[];
  addInstance: (name: string) => Instance;
  removeInstance: (id: string) => void;
  updateInstanceStatus: (id: string, status: InstanceStatus, qrCode?: string, phone?: string) => void;
  getInstanceById: (id: string) => Instance | undefined;
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

const generateQRCode = () => {
  // Simulated QR code data - in real implementation this comes from Baileys
  return `2@${Date.now()}${Math.random().toString(36).substring(7)}`;
};

interface InstanceProviderProps {
  children: ReactNode;
}

export const InstanceProvider: React.FC<InstanceProviderProps> = ({ children }) => {
  const [instances, setInstances] = useState<Instance[]>([
    {
      id: '1',
      name: 'Instância Principal',
      phone: '+55 11 99999-9999',
      status: 'connected',
      createdAt: new Date(Date.now() - 86400000 * 7),
      lastSeen: new Date(),
      apiKey: generateApiKey(),
    },
    {
      id: '2',
      name: 'Suporte',
      status: 'disconnected',
      createdAt: new Date(Date.now() - 86400000 * 3),
      apiKey: generateApiKey(),
    },
  ]);

  const addInstance = (name: string): Instance => {
    const newInstance: Instance = {
      id: Date.now().toString(),
      name,
      status: 'qr_pending',
      qrCode: generateQRCode(),
      createdAt: new Date(),
      apiKey: generateApiKey(),
    };
    
    setInstances(prev => [...prev, newInstance]);
    
    // Simulate QR code generation delay
    setTimeout(() => {
      updateInstanceStatus(newInstance.id, 'qr_pending', generateQRCode());
    }, 500);
    
    return newInstance;
  };

  const removeInstance = (id: string) => {
    setInstances(prev => prev.filter(instance => instance.id !== id));
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

  const getInstanceById = (id: string) => {
    return instances.find(instance => instance.id === id);
  };

  return (
    <InstanceContext.Provider value={{
      instances,
      addInstance,
      removeInstance,
      updateInstanceStatus,
      getInstanceById,
    }}>
      {children}
    </InstanceContext.Provider>
  );
};
