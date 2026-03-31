import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-scan-runner-secret",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const backendBaseUrl = Deno.env.get("SCAN_BACKEND_BASE_URL")?.trim();
    if (!backendBaseUrl) {
      throw new Error("Missing SCAN_BACKEND_BASE_URL");
    }

    const url = `${backendBaseUrl.replace(/\/$/, "")}/api/scans/scheduled/run`;
    const secret = Deno.env.get("SCAN_RUNNER_SECRET")?.trim();

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(secret ? { "x-scan-runner-secret": secret } : {}),
      },
      body: JSON.stringify({ source: "supabase_cron" }),
    });

    const text = await response.text();

    return new Response(text, {
      status: response.status,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Failed to trigger backend scheduler" }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      },
    );
  }
});
