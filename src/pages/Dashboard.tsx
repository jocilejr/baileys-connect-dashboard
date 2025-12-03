import React, { useState, useEffect } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { InstanceCard } from '@/components/InstanceCard';
import { SendMessageDialog } from '@/components/SendMessageDialog';
import { CreateInstanceDialog } from '@/components/CreateInstanceDialog';
import { ApiDocumentation } from '@/components/ApiDocumentation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useInstances } from '@/contexts/InstanceContext';
import { Instance } from '@/types/instance';
import { Plus, Smartphone, MessageSquare, Wifi, WifiOff, RefreshCw } from 'lucide-react';

const Dashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedInstance, setSelectedInstance] = useState<Instance | null>(null);
  const [sendMessageOpen, setSendMessageOpen] = useState(false);
  const [createInstanceOpen, setCreateInstanceOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { instances, isLoading, refreshInstances } = useInstances();

  // Refresh instances on mount and when tab changes to instances
  useEffect(() => {
    if (activeTab === 'instances' || activeTab === 'dashboard') {
      refreshInstances();
    }
  }, [activeTab, refreshInstances]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshInstances();
    setIsRefreshing(false);
  };

  const connectedCount = instances.filter(i => i.status === 'connected').length;
  const disconnectedCount = instances.filter(i => i.status === 'disconnected').length;

  const handleSendMessage = (instance: Instance) => {
    setSelectedInstance(instance);
    setSendMessageOpen(true);
  };

  const handleViewDetails = (instance: Instance) => {
    // TODO: Implement details view
    console.log('View details:', instance);
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <div className="space-y-6">
            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Smartphone className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{instances.length}</p>
                      <p className="text-sm text-muted-foreground">Total Instâncias</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-success/10 flex items-center justify-center">
                      <Wifi className="w-6 h-6 text-success" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{connectedCount}</p>
                      <p className="text-sm text-muted-foreground">Conectadas</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-destructive/10 flex items-center justify-center">
                      <WifiOff className="w-6 h-6 text-destructive" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{disconnectedCount}</p>
                      <p className="text-sm text-muted-foreground">Desconectadas</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-info/10 flex items-center justify-center">
                      <MessageSquare className="w-6 h-6 text-info" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">0</p>
                      <p className="text-sm text-muted-foreground">Mensagens Hoje</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Recent instances */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Instâncias Recentes</CardTitle>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={handleRefresh} disabled={isRefreshing} className="gap-2">
                    <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                    Atualizar
                  </Button>
                  <Button onClick={() => setCreateInstanceOpen(true)} className="gap-2">
                    <Plus className="w-4 h-4" />
                    Nova Instância
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {instances.length === 0 ? (
                  <div className="text-center py-12">
                    <Smartphone className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="font-medium mb-2">Nenhuma instância</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Crie sua primeira instância para começar
                    </p>
                    <Button onClick={() => setCreateInstanceOpen(true)}>
                      Criar Instância
                    </Button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {instances.slice(0, 4).map(instance => (
                      <InstanceCard
                        key={instance.id}
                        instance={instance}
                        onSendMessage={handleSendMessage}
                        onViewDetails={handleViewDetails}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        );

      case 'instances':
        return (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">Instâncias</h2>
                <p className="text-muted-foreground">Gerencie suas conexões do WhatsApp</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleRefresh} disabled={isRefreshing} className="gap-2">
                  <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                  Atualizar
                </Button>
                <Button onClick={() => setCreateInstanceOpen(true)} className="gap-2">
                  <Plus className="w-4 h-4" />
                  Nova Instância
                </Button>
              </div>
            </div>

            {instances.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Smartphone className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="font-medium mb-2">Nenhuma instância</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Crie sua primeira instância para conectar um número do WhatsApp
                  </p>
                  <Button onClick={() => setCreateInstanceOpen(true)}>
                    Criar Instância
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                {instances.map(instance => (
                  <InstanceCard
                    key={instance.id}
                    instance={instance}
                    onSendMessage={handleSendMessage}
                    onViewDetails={handleViewDetails}
                  />
                ))}
              </div>
            )}
          </div>
        );

      case 'docs':
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold">Documentação da API</h2>
              <p className="text-muted-foreground">
                Integre suas aplicações usando nossa API REST
              </p>
            </div>
            <ApiDocumentation />
          </div>
        );

      case 'messages':
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold">Histórico de Mensagens</h2>
              <p className="text-muted-foreground">
                Visualize todas as mensagens enviadas e recebidas
              </p>
            </div>
            <Card>
              <CardContent className="py-12 text-center">
                <MessageSquare className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="font-medium mb-2">Em breve</h3>
                <p className="text-sm text-muted-foreground">
                  O histórico de mensagens será disponibilizado em breve
                </p>
              </CardContent>
            </Card>
          </div>
        );

      case 'settings':
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold">Configurações</h2>
              <p className="text-muted-foreground">
                Configure seu ambiente e preferências
              </p>
            </div>
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-sm text-muted-foreground">
                  Configurações em desenvolvimento
                </p>
              </CardContent>
            </Card>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="flex min-h-screen bg-background dark">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
      
      <main className="flex-1 overflow-auto">
        <div className="p-6 lg:p-8">
          {renderContent()}
        </div>
      </main>

      <SendMessageDialog
        instance={selectedInstance}
        open={sendMessageOpen}
        onOpenChange={setSendMessageOpen}
      />

      <CreateInstanceDialog
        open={createInstanceOpen}
        onOpenChange={setCreateInstanceOpen}
      />
    </div>
  );
};

export default Dashboard;
