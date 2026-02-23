import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ScanNotificationRequest {
  userId: string;
  scanId: string;
  domain: string;
  score: number;
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { userId, scanId, domain, score, summary }: ScanNotificationRequest = await req.json();

    console.log(`Sending scan notification for user ${userId}, scan ${scanId}`);

    // Get user email from auth
    const { data: userData, error: userError } = await supabaseClient.auth.admin.getUserById(userId);
    
    if (userError || !userData.user?.email) {
      console.error("Failed to get user email:", userError);
      return new Response(JSON.stringify({ error: "User not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check notification settings
    const { data: settings } = await supabaseClient
      .from("notification_settings")
      .select("email_notifications, critical_alerts")
      .eq("user_id", userId)
      .maybeSingle();

    // Skip if email notifications are disabled
    if (settings && !settings.email_notifications) {
      console.log("Email notifications disabled for user");
      return new Response(JSON.stringify({ skipped: true, reason: "notifications_disabled" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const hasCritical = summary.critical > 0;
    const totalIssues = summary.critical + summary.high + summary.medium + summary.low;
    
    // Determine email priority and styling
    const scoreColor = score >= 80 ? "#22c55e" : score >= 50 ? "#f59e0b" : "#ef4444";
    const scoreLabel = score >= 80 ? "Good" : score >= 50 ? "At Risk" : "Critical";
    
    const urgencyMessage = hasCritical 
      ? `⚠️ URGENT: ${summary.critical} critical vulnerabilities found that require immediate attention.`
      : totalIssues > 0 
        ? `${totalIssues} security issues were detected that should be addressed.`
        : "No significant security issues were found.";

    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f4f4f5; margin: 0; padding: 20px;">
          <div style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
            
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #1e293b 0%, #334155 100%); padding: 32px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 24px;">🛡️ CyberShield</h1>
              <p style="color: #94a3b8; margin: 8px 0 0 0; font-size: 14px;">Security Scan Complete</p>
            </div>
            
            <!-- Score Section -->
            <div style="padding: 32px; text-align: center; border-bottom: 1px solid #e4e4e7;">
              <p style="color: #71717a; margin: 0 0 12px 0; font-size: 14px;">Security Score for</p>
              <h2 style="color: #18181b; margin: 0 0 16px 0; font-size: 20px;">${domain}</h2>
              <div style="display: inline-block; width: 100px; height: 100px; border-radius: 50%; background-color: ${scoreColor}20; line-height: 100px; text-align: center;">
                <span style="font-size: 36px; font-weight: bold; color: ${scoreColor};">${score}</span>
              </div>
              <p style="color: ${scoreColor}; margin: 12px 0 0 0; font-size: 16px; font-weight: 600;">${scoreLabel}</p>
            </div>
            
            <!-- Issues Summary -->
            <div style="padding: 24px 32px;">
              <p style="color: #18181b; margin: 0 0 16px 0; font-size: 16px;">${urgencyMessage}</p>
              
              <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 24px;">
                ${summary.critical > 0 ? `<span style="background-color: #fef2f2; color: #dc2626; padding: 4px 12px; border-radius: 9999px; font-size: 13px; font-weight: 500;">${summary.critical} Critical</span>` : ''}
                ${summary.high > 0 ? `<span style="background-color: #fff7ed; color: #ea580c; padding: 4px 12px; border-radius: 9999px; font-size: 13px; font-weight: 500;">${summary.high} High</span>` : ''}
                ${summary.medium > 0 ? `<span style="background-color: #fefce8; color: #ca8a04; padding: 4px 12px; border-radius: 9999px; font-size: 13px; font-weight: 500;">${summary.medium} Medium</span>` : ''}
                ${summary.low > 0 ? `<span style="background-color: #f0fdf4; color: #16a34a; padding: 4px 12px; border-radius: 9999px; font-size: 13px; font-weight: 500;">${summary.low} Low</span>` : ''}
                ${totalIssues === 0 ? `<span style="background-color: #f0fdf4; color: #16a34a; padding: 4px 12px; border-radius: 9999px; font-size: 13px; font-weight: 500;">✓ No issues found</span>` : ''}
              </div>
              
              <!-- CTA Button -->
              <a href="${Deno.env.get("SUPABASE_URL")?.replace('.supabase.co', '.lovable.app') || '#'}/scans/${scanId}" 
                 style="display: inline-block; background-color: #3b82f6; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500; font-size: 14px;">
                View Full Report →
              </a>
            </div>
            
            <!-- Footer -->
            <div style="background-color: #f4f4f5; padding: 20px 32px; text-align: center;">
              <p style="color: #71717a; margin: 0; font-size: 12px;">
                You're receiving this because you have email notifications enabled.<br>
                <a href="#" style="color: #3b82f6;">Manage notification settings</a>
              </p>
            </div>
          </div>
        </body>
      </html>
    `;

    const subject = hasCritical 
      ? `🚨 Critical vulnerabilities found on ${domain}`
      : `Security scan complete for ${domain} - Score: ${score}`;

    const { data: emailData, error: emailError } = await resend.emails.send({
      from: "CyberShield <onboarding@resend.dev>",
      to: [userData.user.email],
      subject,
      html: emailHtml,
    });

    if (emailError) {
      console.error("Failed to send email:", emailError);
      throw emailError;
    }

    console.log("Email sent successfully:", emailData);

    return new Response(JSON.stringify({ success: true, emailId: emailData?.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Error in send-scan-notification:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
