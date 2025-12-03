# Servidor WhatsApp Baileys

Servidor Node.js completo com Baileys para gerenciamento de múltiplas instâncias WhatsApp.

## 🚀 Instalação na VPS

### Requisitos
- Node.js 18+
- npm ou yarn

### Passos

```bash
# 1. Clone ou copie os arquivos para sua VPS
cd /var/www/baileys-server

# 2. Instale as dependências
npm install

# 3. Inicie o servidor
npm start

# Ou em modo desenvolvimento
npm run dev
```

### Com PM2 (Recomendado para produção)

```bash
# Instale o PM2 globalmente
npm install -g pm2

# Inicie com PM2
pm2 start src/index.js --name baileys-server

# Configurar inicialização automática
pm2 startup
pm2 save
```

### Com Docker

```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

EXPOSE 3001
CMD ["npm", "start"]
```

```bash
docker build -t baileys-server .
docker run -d -p 3001:3001 -v $(pwd)/sessions:/app/sessions baileys-server
```

## 📡 Endpoints da API

### Instâncias

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| POST | `/api/v1/instance/create` | Criar nova instância |
| GET | `/api/v1/instance/list` | Listar todas instâncias |
| GET | `/api/v1/instance/:id/status` | Status da instância |
| GET | `/api/v1/instance/:id/qr` | Obter QR Code |
| DELETE | `/api/v1/instance/:id` | Deletar instância |
| POST | `/api/v1/instance/:id/reconnect` | Reconectar instância |
| PUT | `/api/v1/instance/:id/webhook` | Atualizar webhook |

### Mensagens

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| POST | `/api/v1/message/send` | Enviar mensagem (texto/mídia) |
| POST | `/api/v1/message/send-image` | Enviar imagem |
| POST | `/api/v1/message/send-document` | Enviar documento |
| POST | `/api/v1/message/send-audio` | Enviar áudio |

## 📝 Exemplos de Uso

### Criar Instância

```bash
curl -X POST http://localhost:3001/api/v1/instance/create \
  -H "Content-Type: application/json" \
  -d '{
    "instanceId": "minha-instancia",
    "name": "WhatsApp Principal",
    "webhookUrl": "https://meusite.com/webhook"
  }'
```

### Obter QR Code

```bash
curl http://localhost:3001/api/v1/instance/minha-instancia/qr
```

Resposta:
```json
{
  "qrCode": "data:image/png;base64,..."
}
```

### Enviar Mensagem de Texto

```bash
curl -X POST http://localhost:3001/api/v1/message/send \
  -H "Content-Type: application/json" \
  -d '{
    "instanceId": "minha-instancia",
    "to": "5511999999999",
    "message": "Olá! Esta é uma mensagem de teste."
  }'
```

### Enviar Imagem

```bash
curl -X POST http://localhost:3001/api/v1/message/send-image \
  -H "Content-Type: application/json" \
  -d '{
    "instanceId": "minha-instancia",
    "to": "5511999999999",
    "imageUrl": "https://exemplo.com/imagem.jpg",
    "caption": "Veja esta imagem!"
  }'
```

### Enviar Documento

```bash
curl -X POST http://localhost:3001/api/v1/message/send-document \
  -H "Content-Type: application/json" \
  -d '{
    "instanceId": "minha-instancia",
    "to": "5511999999999",
    "documentUrl": "https://exemplo.com/arquivo.pdf",
    "caption": "Segue o documento"
  }'
```

## 🔌 WebSocket

Conecte-se ao WebSocket para receber eventos em tempo real:

```javascript
const ws = new WebSocket('ws://localhost:3001/ws?instanceId=minha-instancia');

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  switch (data.type) {
    case 'qr':
      console.log('Novo QR Code:', data.qrCode);
      break;
    case 'status':
      console.log('Status:', data.status, data.phone);
      break;
    case 'message':
      console.log('Nova mensagem:', data.data);
      break;
  }
};
```

## 🔔 Webhooks

Configure um webhook para receber mensagens:

```javascript
// Seu servidor de webhook
app.post('/webhook', (req, res) => {
  const { instanceId, type, data } = req.body;
  
  if (type === 'message') {
    console.log(`Mensagem recebida na instância ${instanceId}:`, data);
  }
  
  res.sendStatus(200);
});
```

## 🔒 Segurança (Produção)

### Adicionar Autenticação

Crie um middleware de API Key:

```javascript
// src/middleware/auth.js
const API_KEY = process.env.API_KEY || 'sua-api-key-secreta';

const authMiddleware = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey || apiKey !== API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  next();
};

module.exports = authMiddleware;
```

### Variáveis de Ambiente

```bash
# .env
PORT=3001
API_KEY=sua-api-key-super-secreta
NODE_ENV=production
```

### NGINX Reverse Proxy

```nginx
server {
    listen 80;
    server_name api.seudominio.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## 📁 Estrutura de Arquivos

```
baileys-server/
├── package.json
├── src/
│   ├── index.js          # Servidor Express + WebSocket
│   ├── instanceManager.js # Gerenciamento de instâncias Baileys
│   └── routes.js         # Rotas da API
└── sessions/             # Sessões salvas (criado automaticamente)
```

## 🔧 Conectando com o Frontend Lovable

No frontend, configure a URL do seu servidor:

```typescript
// src/services/baileysApi.ts
const API_URL = 'https://api.seudominio.com/api/v1';

export const createInstance = async (name: string) => {
  const response = await fetch(`${API_URL}/instance/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      instanceId: Date.now().toString(), 
      name 
    })
  });
  return response.json();
};
```

## ⚠️ Notas Importantes

1. **Sessões**: As sessões são salvas em `./sessions/`. Faça backup regularmente.
2. **Rate Limits**: O WhatsApp pode bloquear números que enviam muitas mensagens. Use com moderação.
3. **Termos de Uso**: Este projeto usa APIs não oficiais. Use por sua conta e risco.
4. **Múltiplas Instâncias**: Cada instância consome memória. Monitore recursos do servidor.
