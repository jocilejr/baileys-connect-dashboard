import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Badge } from './ui/badge';

export const ApiDocumentation: React.FC = () => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Documentação da API</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="send">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="send">Enviar Mensagem</TabsTrigger>
            <TabsTrigger value="status">Status</TabsTrigger>
            <TabsTrigger value="webhook">Webhook</TabsTrigger>
          </TabsList>

          <TabsContent value="send" className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge className="bg-success">POST</Badge>
                <code className="text-sm">/api/v1/message/send</code>
              </div>
              <pre className="p-4 bg-muted rounded-lg text-xs overflow-x-auto">
{`// Headers
{
  "Authorization": "Bearer YOUR_API_KEY",
  "Content-Type": "application/json"
}

// Body
{
  "to": "5511999999999",
  "type": "text",
  "message": "Olá! Esta é uma mensagem de teste."
}

// Response
{
  "success": true,
  "messageId": "BAE5XXXXXX",
  "timestamp": 1699999999
}`}
              </pre>
            </div>
          </TabsContent>

          <TabsContent value="status" className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge className="bg-info">GET</Badge>
                <code className="text-sm">/api/v1/instance/status</code>
              </div>
              <pre className="p-4 bg-muted rounded-lg text-xs overflow-x-auto">
{`// Headers
{
  "Authorization": "Bearer YOUR_API_KEY"
}

// Response
{
  "connected": true,
  "phone": "5511999999999",
  "name": "Minha Instância",
  "lastSeen": "2024-01-15T10:30:00Z"
}`}
              </pre>
            </div>
          </TabsContent>

          <TabsContent value="webhook" className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Configure um webhook para receber mensagens em tempo real:
              </p>
              <pre className="p-4 bg-muted rounded-lg text-xs overflow-x-auto">
{`// Payload recebido no seu webhook
{
  "event": "message.received",
  "instanceId": "abc123",
  "data": {
    "from": "5511999999999",
    "message": "Olá!",
    "type": "text",
    "timestamp": 1699999999,
    "messageId": "BAE5XXXXXX"
  }
}`}
              </pre>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};
