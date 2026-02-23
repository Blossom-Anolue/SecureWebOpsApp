import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ScanIssue {
  id: string;
  title: string;
  description: string;
  severity: string;
  category: string;
  business_impact: string;
  recommendation: string;
  owasp_category?: string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getSeverityColor(severity: string): string {
  switch (severity) {
    case "critical": return "#dc2626";
    case "high": return "#ea580c";
    case "medium": return "#ca8a04";
    case "low": return "#2563eb";
    default: return "#6b7280";
  }
}

function getScoreColor(score: number): string {
  if (score >= 80) return "#16a34a";
  if (score >= 50) return "#ca8a04";
  return "#dc2626";
}

function generatePdfHtml(scan: any, issues: ScanIssue[]): string {
  const scoreColor = getScoreColor(scan.score || 0);
  const date = new Date(scan.started_at).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const issuesHtml = issues.length === 0 
    ? `<div style="text-align: center; padding: 40px; background: #f0fdf4; border-radius: 8px; margin-top: 20px;">
        <p style="color: #16a34a; font-size: 18px; margin: 0;">✓ No security issues found</p>
        <p style="color: #6b7280; margin-top: 8px;">Your website looks secure!</p>
      </div>`
    : issues.map((issue, index) => `
      <div style="border: 1px solid #e5e7eb; border-radius: 8px; margin-top: 16px; overflow: hidden;">
        <div style="background: ${getSeverityColor(issue.severity)}15; padding: 12px 16px; border-bottom: 1px solid #e5e7eb;">
          <span style="display: inline-block; background: ${getSeverityColor(issue.severity)}; color: white; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 600; text-transform: uppercase;">${escapeHtml(issue.severity)}</span>
          <span style="margin-left: 12px; font-weight: 600; font-size: 16px;">${escapeHtml(issue.title)}</span>
        </div>
        <div style="padding: 16px;">
          <p style="color: #374151; margin: 0 0 12px 0;"><strong>Category:</strong> ${escapeHtml(issue.category)}</p>
          <p style="color: #374151; margin: 0 0 12px 0;"><strong>Description:</strong> ${escapeHtml(issue.description)}</p>
          <div style="background: #fef2f2; border-left: 4px solid #dc2626; padding: 12px; margin: 12px 0;">
            <p style="margin: 0; color: #991b1b;"><strong>Business Impact:</strong></p>
            <p style="margin: 4px 0 0 0; color: #374151;">${escapeHtml(issue.business_impact)}</p>
          </div>
          <div style="background: #f0fdf4; border-left: 4px solid #16a34a; padding: 12px; margin: 12px 0;">
            <p style="margin: 0; color: #166534;"><strong>Recommendation:</strong></p>
            <p style="margin: 4px 0 0 0; color: #374151;">${escapeHtml(issue.recommendation)}</p>
          </div>
          ${issue.owasp_category ? `<p style="color: #6b7280; font-size: 12px; margin: 8px 0 0 0;">OWASP: ${escapeHtml(issue.owasp_category)}</p>` : ""}
        </div>
      </div>
    `).join("");

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Security Report - ${escapeHtml(scan.domain)}</title>
  <style>
    * { box-sizing: border-box; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      margin: 0; 
      padding: 40px;
      color: #111827;
      line-height: 1.5;
    }
    @media print {
      body { padding: 20px; }
      .page-break { page-break-before: always; }
    }
  </style>
</head>
<body>
  <div style="text-align: center; margin-bottom: 40px;">
    <h1 style="margin: 0; font-size: 28px; color: #111827;">🛡️ CyberShield Security Report</h1>
    <p style="color: #6b7280; margin: 8px 0 0 0;">Generated on ${date}</p>
  </div>

  <div style="background: linear-gradient(135deg, #1e293b 0%, #334155 100%); border-radius: 12px; padding: 24px; color: white; margin-bottom: 32px;">
    <div style="display: flex; align-items: center; gap: 24px;">
      <div style="width: 80px; height: 80px; background: ${scoreColor}; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
        <span style="font-size: 28px; font-weight: 700;">${scan.score ?? "N/A"}</span>
      </div>
      <div>
        <h2 style="margin: 0; font-size: 24px;">${escapeHtml(scan.domain)}</h2>
        <p style="margin: 4px 0 0 0; opacity: 0.8;">${scan.scan_type === "quick" ? "Quick" : "Full"} Security Scan</p>
      </div>
    </div>
  </div>

  <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 32px;">
    <div style="background: #fef2f2; border-radius: 8px; padding: 16px; text-align: center;">
      <p style="margin: 0; font-size: 24px; font-weight: 700; color: #dc2626;">${scan.critical_count || 0}</p>
      <p style="margin: 4px 0 0 0; color: #991b1b; font-size: 14px;">Critical</p>
    </div>
    <div style="background: #fff7ed; border-radius: 8px; padding: 16px; text-align: center;">
      <p style="margin: 0; font-size: 24px; font-weight: 700; color: #ea580c;">${scan.high_count || 0}</p>
      <p style="margin: 4px 0 0 0; color: #c2410c; font-size: 14px;">High</p>
    </div>
    <div style="background: #fefce8; border-radius: 8px; padding: 16px; text-align: center;">
      <p style="margin: 0; font-size: 24px; font-weight: 700; color: #ca8a04;">${scan.medium_count || 0}</p>
      <p style="margin: 4px 0 0 0; color: #a16207; font-size: 14px;">Medium</p>
    </div>
    <div style="background: #eff6ff; border-radius: 8px; padding: 16px; text-align: center;">
      <p style="margin: 0; font-size: 24px; font-weight: 700; color: #2563eb;">${scan.low_count || 0}</p>
      <p style="margin: 4px 0 0 0; color: #1d4ed8; font-size: 14px;">Low</p>
    </div>
  </div>

  <h2 style="margin: 0 0 16px 0; font-size: 20px; color: #111827;">Security Issues (${issues.length})</h2>
  ${issuesHtml}

  <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center; color: #6b7280; font-size: 12px;">
    <p style="margin: 0;">This report was generated by CyberShield Security Scanner</p>
    <p style="margin: 4px 0 0 0;">For questions or support, contact your security team</p>
  </div>
</body>
</html>
  `;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const { scanId } = await req.json();
    if (!scanId) {
      return new Response(JSON.stringify({ error: "Scan ID required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    console.log(`Generating PDF report for scan: ${scanId}`);

    // Fetch scan details
    const { data: scan, error: scanError } = await supabase
      .from("scans")
      .select("*")
      .eq("id", scanId)
      .eq("user_id", user.id)
      .single();

    if (scanError || !scan) {
      console.error("Scan fetch error:", scanError);
      return new Response(JSON.stringify({ error: "Scan not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Fetch scan issues
    const { data: issues, error: issuesError } = await supabase
      .from("scan_issues")
      .select("*")
      .eq("scan_id", scanId)
      .eq("user_id", user.id)
      .order("severity", { ascending: true });

    if (issuesError) {
      console.error("Issues fetch error:", issuesError);
    }

    // Sort issues by severity
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    const sortedIssues = (issues || []).sort(
      (a, b) => (severityOrder[a.severity as keyof typeof severityOrder] || 4) - 
                (severityOrder[b.severity as keyof typeof severityOrder] || 4)
    );

    const html = generatePdfHtml(scan, sortedIssues);

    console.log(`PDF HTML generated successfully for scan: ${scanId}`);

    return new Response(JSON.stringify({ html }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: unknown) {
    console.error("PDF generation error:", error);
    const message = error instanceof Error ? error.message : "Failed to generate report";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
