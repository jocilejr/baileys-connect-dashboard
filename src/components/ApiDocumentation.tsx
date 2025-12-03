import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Badge } from './ui/badge';

const API_BASE_URL = 'http://72.60.249.69:3001';

export const ApiDocumentation: React.FC = () => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Documentação da API</CardTitle>
        <p className="text-sm text-muted-foreground">
          Base URL: <code className="bg-muted px-2 py-1 rounded">{API_BASE_URL}</code>
        </p>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="instances">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="instances">Instâncias</TabsTrigger>
            <TabsTrigger value="send">Enviar</TabsTrigger>
            <TabsTrigger value="status">Status</TabsTrigger>
            <TabsTrigger value="webhook">Webhook</TabsTrigger>
          </TabsList>

          <TabsContent value="instances" className="space-y-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge className="bg-success">POST</Badge>
                  <code className="text-sm">/api/v1/instance/create</code>
                </div>
                <pre className="p-4 bg-muted rounded-lg text-xs overflow-x-auto">
{`// Criar nova instância
{
  "name": "Minha Instância",
  "webhookUrl": "https://seu-servidor.com/webhook" // opcional
}

// Response
{
  "success": true,
  "instanceId": "abc123",
  "name": "Minha Instância",
  "status": "qr_pending"
}`}
                </pre>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge className="bg-info">GET</Badge>
                  <code className="text-sm">/api/v1/instance/list</code>
                </div>
                <pre className="p-4 bg-muted rounded-lg text-xs overflow-x-auto">
{`// Listar todas as instâncias
// Response
{
  "success": true,
  "instances": [
    { "instanceId": "abc123", "status": "connected", "phone": "5511999999999" }
  ]
}`}
                </pre>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge className="bg-destructive">DELETE</Badge>
                  <code className="text-sm">/api/v1/instance/:instanceId</code>
                </div>
                <pre className="p-4 bg-muted rounded-lg text-xs overflow-x-auto">
{`// Deletar instância
// Response
{
  "success": true,
  "message": "Instance deleted"
}`}
                </pre>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="send" className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge className="bg-success">POST</Badge>
                <code className="text-sm">/api/v1/message/send</code>
              </div>
              <pre className="p-4 bg-muted rounded-lg text-xs overflow-x-auto">
{`// Enviar mensagem de texto
{
  "instanceId": "abc123",
  "to": "5511999999999",
  "message": "Olá! Esta é uma mensagem de teste."
}

// Response
{
  "success": true,
  "messageId": "BAE5XXXXXX"
}`}
              </pre>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge className="bg-success">POST</Badge>
                <code className="text-sm">/api/v1/message/send-image</code>
              </div>
              <pre className="p-4 bg-muted rounded-lg text-xs overflow-x-auto">
{`// Enviar imagem
{
  "instanceId": "abc123",
  "to": "5511999999999",
  "imageUrl": "https://exemplo.com/imagem.jpg",
  "caption": "Legenda opcional"
}`}
              </pre>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge className="bg-success">POST</Badge>
                <code className="text-sm">/api/v1/message/send-document</code>
              </div>
              <pre className="p-4 bg-muted rounded-lg text-xs overflow-x-auto">
{`// Enviar documento
{
  "instanceId": "abc123",
  "to": "5511999999999",
  "documentUrl": "https://exemplo.com/arquivo.pdf",
  "filename": "documento.pdf"
}`}
              </pre>
            </div>
          </TabsContent>

          <TabsContent value="status" className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge className="bg-info">GET</Badge>
                <code className="text-sm">/api/v1/instance/:instanceId/status</code>
              </div>
              <pre className="p-4 bg-muted rounded-lg text-xs overflow-x-auto">
{`// Response
{
  "success": true,
  "instanceId": "abc123",
  "status": "connected",
  "phone": "5511999999999",
  "name": "Minha Instância"
}`}
              </pre>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge className="bg-warning">POST</Badge>
                <code className="text-sm">/api/v1/instance/:instanceId/reconnect</code>
              </div>
              <pre className="p-4 bg-muted rounded-lg text-xs overflow-x-auto">
{`// Reconectar instância (gera novo QR code)
// Response
{
  "success": true,
  "message": "Reconnecting..."
}`}
              </pre>
            </div>
          </TabsContent>

          <TabsContent value="webhook" className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Configure um webhook para receber mensagens em tempo real. O webhook é configurado ao criar a instância.
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
}

// WebSocket (tempo real)
ws://${API_BASE_URL.replace('http://', '')}/ws?instanceId=abc123

// Eventos WebSocket:
// - qr: { event: "qr", qr: "qr_code_string" }
// - status: { event: "status", status: "connected", phone: "..." }
// - message: { event: "message", message: {...} }`}
              </pre>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};
