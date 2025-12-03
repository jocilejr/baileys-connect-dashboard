import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const BAILEYS_SERVER_URL = "http://72.60.249.69:3001";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const path = url.searchParams.get("path") || "";
    const targetUrl = `${BAILEYS_SERVER_URL}${path}`;

    const body = req.method !== "GET" && req.method !== "HEAD" ? await req.text() : undefined;
    
    console.log(`Proxying ${req.method} to: ${targetUrl}`);
    console.log(`Request body: ${body}`);

    // Forward the request to Baileys server
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: {
        "Content-Type": "application/json",
      },
      body,
    });

    const data = await response.text();
    console.log(`Response status: ${response.status}`);

    return new Response(data, {
      status: response.status,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    console.error("Proxy error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
