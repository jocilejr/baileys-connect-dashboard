import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const BAILEYS_WS_URL = "ws://72.60.249.69:3001/ws";

serve(async (req) => {
  const { headers } = req;
  const upgradeHeader = headers.get("upgrade") || "";

  if (upgradeHeader.toLowerCase() !== "websocket") {
    return new Response("Expected WebSocket connection", { status: 400 });
  }

  const url = new URL(req.url);
  const instanceId = url.searchParams.get("instanceId");

  if (!instanceId) {
    return new Response("instanceId is required", { status: 400 });
  }

  console.log(`[WS Proxy] Upgrading connection for instance: ${instanceId}`);

  const { socket: clientSocket, response } = Deno.upgradeWebSocket(req);

  let baileysSocket: WebSocket | null = null;

  clientSocket.onopen = () => {
    console.log(`[WS Proxy] Client connected for instance: ${instanceId}`);
    
    // Connect to Baileys server
    const targetUrl = `${BAILEYS_WS_URL}?instanceId=${instanceId}`;
    console.log(`[WS Proxy] Connecting to Baileys: ${targetUrl}`);
    
    baileysSocket = new WebSocket(targetUrl);

    baileysSocket.onopen = () => {
      console.log(`[WS Proxy] Connected to Baileys server for instance: ${instanceId}`);
    };

    baileysSocket.onmessage = (event) => {
      console.log(`[WS Proxy] Message from Baileys:`, event.data);
      if (clientSocket.readyState === WebSocket.OPEN) {
        clientSocket.send(event.data);
      }
    };

    baileysSocket.onerror = (error) => {
      console.error(`[WS Proxy] Baileys socket error:`, error);
    };

    baileysSocket.onclose = (event) => {
      console.log(`[WS Proxy] Baileys socket closed: ${event.code} ${event.reason}`);
      if (clientSocket.readyState === WebSocket.OPEN) {
        clientSocket.close(event.code, event.reason);
      }
    };
  };

  clientSocket.onmessage = (event) => {
    console.log(`[WS Proxy] Message from client:`, event.data);
    if (baileysSocket && baileysSocket.readyState === WebSocket.OPEN) {
      baileysSocket.send(event.data);
    }
  };

  clientSocket.onerror = (error) => {
    console.error(`[WS Proxy] Client socket error:`, error);
  };

  clientSocket.onclose = (event) => {
    console.log(`[WS Proxy] Client disconnected: ${event.code} ${event.reason}`);
    if (baileysSocket && baileysSocket.readyState === WebSocket.OPEN) {
      baileysSocket.close();
    }
  };

  return response;
});
