import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("Starting scheduled scan check...");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const serviceClient = createClient(supabaseUrl, serviceRoleKey);

    // Get all active schedules that are due
    const now = new Date().toISOString();
    const { data: dueSchedules, error: schedulesError } = await serviceClient
      .from("scan_schedules")
      .select(`
        id,
        user_id,
        domain_id,
        frequency,
        day_of_week,
        day_of_month,
        scan_type,
        domains!inner(domain)
      `)
      .eq("is_active", true)
      .lte("next_run_at", now);

    if (schedulesError) {
      console.error("Error fetching schedules:", schedulesError);
      throw schedulesError;
    }

    console.log(`Found ${dueSchedules?.length || 0} due schedules`);

    if (!dueSchedules || dueSchedules.length === 0) {
      return new Response(
        JSON.stringify({ message: "No scheduled scans due", scansTriggered: 0 }),
        { headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const scansTriggered = [];

    for (const schedule of dueSchedules) {
      try {
        const domain = (schedule.domains as any)?.domain;
        
        if (!domain) {
          console.error(`No domain found for schedule ${schedule.id}`);
          continue;
        }

        console.log(`Triggering scan for domain: ${domain}`);

        // Create a new scan record
        const { data: scan, error: scanError } = await serviceClient
          .from("scans")
          .insert({
            user_id: schedule.user_id,
            domain_id: schedule.domain_id,
            domain: domain,
            scan_type: schedule.scan_type,
            status: "pending",
          })
          .select()
          .single();

        if (scanError) {
          console.error(`Error creating scan for schedule ${schedule.id}:`, scanError);
          continue;
        }

        // Trigger the security scan function
        const { error: invokeError } = await serviceClient.functions.invoke("security-scan", {
          body: {
            scanId: scan.id,
            domain: domain,
            scanType: schedule.scan_type,
            userId: schedule.user_id,
          },
        });

        if (invokeError) {
          console.error(`Error invoking security-scan for ${domain}:`, invokeError);
        }

        // Calculate next run time
        const nextRunAt = calculateNextRunTime(schedule.frequency, schedule.day_of_week, schedule.day_of_month);

        // Update schedule with last run and next run times
        await serviceClient
          .from("scan_schedules")
          .update({
            last_run_at: now,
            next_run_at: nextRunAt.toISOString(),
          })
          .eq("id", schedule.id);

        scansTriggered.push({
          scheduleId: schedule.id,
          domain: domain,
          scanId: scan.id,
        });

        console.log(`Successfully triggered scan for ${domain}, next run: ${nextRunAt.toISOString()}`);
      } catch (err) {
        console.error(`Error processing schedule ${schedule.id}:`, err);
      }
    }

    console.log(`Scheduled scan check complete. Triggered ${scansTriggered.length} scans.`);

    return new Response(
      JSON.stringify({ 
        message: "Scheduled scans processed",
        scansTriggered: scansTriggered.length,
        details: scansTriggered,
      }),
      { headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in scheduled-scan function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});

function calculateNextRunTime(frequency: string, dayOfWeek: number | null, dayOfMonth: number | null): Date {
  const now = new Date();
  const next = new Date(now);

  if (frequency === "weekly" && dayOfWeek !== null) {
    // Set to next occurrence of the specified day
    const currentDay = now.getDay();
    let daysUntilNext = dayOfWeek - currentDay;
    if (daysUntilNext <= 0) {
      daysUntilNext += 7;
    }
    next.setDate(now.getDate() + daysUntilNext);
    next.setHours(9, 0, 0, 0); // Run at 9 AM
  } else if (frequency === "monthly" && dayOfMonth !== null) {
    // Set to next occurrence of the specified day of month
    next.setDate(dayOfMonth);
    next.setHours(9, 0, 0, 0);
    if (next <= now) {
      next.setMonth(next.getMonth() + 1);
    }
  } else {
    // Default: next week
    next.setDate(now.getDate() + 7);
    next.setHours(9, 0, 0, 0);
  }

  return next;
}
