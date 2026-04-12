import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface WelcomeEmailRequest {
  email: string;
  name: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, name }: WelcomeEmailRequest = await req.json();

    console.log(`Sending welcome email to ${email}`);

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
              <h1 style="color: white; margin: 0; font-size: 24px;">🛡️ SecureWebOps</h1>
              <p style="color: #94a3b8; margin: 8px 0 0 0; font-size: 14px;">Welcome Aboard!</p>
            </div>
            
            <!-- Content Section -->
            <div style="padding: 32px; text-align: left;">
              <h2 style="color: #18181b; margin: 0 0 16px 0; font-size: 20px;">Hi ${name || 'there'},</h2>
              <p style="color: #3f3f46; margin: 0 0 16px 0; font-size: 16px; line-height: 1.5;">
                Welcome to SecureWebOps! We are thrilled to have you join us. 
              </p>
              <p style="color: #3f3f46; margin: 0 0 16px 0; font-size: 16px; line-height: 1.5;">
                Our platform is designed to provide you with the best security tools and insights to keep your operations safe.
              </p>
              <p style="color: #3f3f46; margin: 0 0 24px 0; font-size: 16px; line-height: 1.5;">
                To get started, please make sure you verify your email address. Then you can log in and start exploring your dashboard.
              </p>
              
              <div style="text-align: center;">
                <a href="${Deno.env.get("SUPABASE_URL")?.replace('.supabase.co', '.lovable.app') || 'https://securewebops.com'}/dashboard" 
                   style="display: inline-block; background-color: #3b82f6; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500; font-size: 14px;">
                  Go to Dashboard
                </a>
              </div>
            </div>
            
            <!-- Footer -->
            <div style="background-color: #f4f4f5; padding: 20px 32px; text-align: center;">
              <p style="color: #71717a; margin: 0; font-size: 12px;">
                SecureWebOps Team<br>
                <a href="https://securewebops.com" style="color: #3b82f6; text-decoration: none;">securewebops.com</a>
              </p>
            </div>
          </div>
        </body>
      </html>
    `;

    const { data: emailData, error: emailError } = await resend.emails.send({
      from: "SecureWebOps <onboarding@resend.dev>",
      to: [email],
      subject: "Welcome to SecureWebOps!",
      html: emailHtml,
    });

    if (emailError) {
      console.error("Failed to send welcome email:", emailError);
      throw emailError;
    }

    console.log("Welcome email sent successfully:", emailData);

    return new Response(JSON.stringify({ success: true, emailId: emailData?.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Error in send-welcome-email:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
