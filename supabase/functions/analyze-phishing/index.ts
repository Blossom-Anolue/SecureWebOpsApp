import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PhishingAnalysisRequest {
  type: "email" | "link";
  content: string;
  subject?: string;
  senderEmail?: string;
}

interface RedFlag {
  title: string;
  description: string;
  severity: "high" | "medium" | "low";
}

interface AnalysisResult {
  riskLevel: "high" | "medium" | "low";
  verdict: string;
  redFlags: RedFlag[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { type, content, subject, senderEmail }: PhishingAnalysisRequest = await req.json();

    if (!content || !type) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Analyzing ${type} content for user ${user.id}`);

    const systemPrompt = `You are an expert cybersecurity analyst specializing in phishing detection. Analyze the provided ${type} content and determine if it's a phishing attempt.

Your analysis must be thorough and consider:
- Suspicious domains or lookalike URLs
- Urgent or threatening language designed to provoke immediate action
- Requests for sensitive information (passwords, banking details, SSN)
- Grammar and spelling errors
- Mismatched sender addresses
- Suspicious attachments or links
- Impersonation of legitimate organizations
- Too-good-to-be-true offers

Respond with a JSON object in this exact format:
{
  "riskLevel": "high" | "medium" | "low",
  "verdict": "A brief 1-2 sentence verdict explaining the overall risk",
  "redFlags": [
    {
      "title": "Short title of the red flag",
      "description": "Detailed explanation of why this is concerning",
      "severity": "high" | "medium" | "low"
    }
  ]
}

Guidelines:
- "high" risk: Clear indicators of phishing, do not interact
- "medium" risk: Suspicious elements present, verify through official channels
- "low" risk: Appears legitimate but always exercise caution

Provide 2-5 red flags if found, or explain why it appears safe if low risk.`;

    let userPrompt = "";
    if (type === "email") {
      userPrompt = `Analyze this email for phishing indicators:

${subject ? `Subject: ${subject}` : ""}
${senderEmail ? `From: ${senderEmail}` : ""}

Email Body:
${content}`;
    } else {
      userPrompt = `Analyze this URL/link for phishing indicators:

URL: ${content}

Consider domain reputation, URL structure, and any visible red flags.`;
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI service credits exhausted. Please contact support." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiResponse = await response.json();
    const aiContent = aiResponse.choices?.[0]?.message?.content;
    
    if (!aiContent) {
      throw new Error("No response from AI");
    }

    console.log("AI response:", aiContent);

    // Parse the JSON from the AI response
    let analysis: AnalysisResult;
    try {
      // Extract JSON from potential markdown code blocks
      const jsonMatch = aiContent.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, aiContent];
      const jsonStr = jsonMatch[1].trim();
      analysis = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error("Failed to parse AI response:", parseError);
      // Fallback analysis
      analysis = {
        riskLevel: "medium",
        verdict: "Unable to fully analyze. Exercise caution with this content.",
        redFlags: [
          {
            title: "Analysis incomplete",
            description: "The AI analysis could not be fully processed. Please review manually.",
            severity: "medium",
          },
        ],
      };
    }

    // Save to database
    const { data: checkData, error: insertError } = await supabaseClient
      .from("phishing_checks")
      .insert({
        user_id: user.id,
        check_type: type,
        content: content.substring(0, 5000), // Limit content size
        subject: subject || null,
        sender_email: senderEmail || null,
        risk_level: analysis.riskLevel,
        verdict: analysis.verdict,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Failed to save phishing check:", insertError);
    } else if (checkData && analysis.redFlags.length > 0) {
      // Save red flags
      const redFlagsToInsert = analysis.redFlags.map((flag) => ({
        check_id: checkData.id,
        user_id: user.id,
        title: flag.title,
        description: flag.description,
        severity: flag.severity,
      }));

      const { error: flagsError } = await supabaseClient
        .from("phishing_red_flags")
        .insert(redFlagsToInsert);

      if (flagsError) {
        console.error("Failed to save red flags:", flagsError);
      }
    }

    return new Response(
      JSON.stringify({
        id: checkData?.id,
        riskLevel: analysis.riskLevel,
        verdict: analysis.verdict,
        redFlags: analysis.redFlags,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in analyze-phishing:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
