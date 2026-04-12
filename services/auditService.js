import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

let supabase;
if (supabaseUrl && supabaseServiceKey) {
    supabase = createClient(supabaseUrl, supabaseServiceKey);
}

/**
 * Centralized Audit Logging Service
 * Records security events securely to the activity_logs table.
 */
export async function logEvent(logData) {
    if (!supabase) {
        console.warn("[Audit] Missing Supabase keys. Cannot log:", logData.action);
        return;
    }

    try {
        // Use a short 5-second timeout to ensure logging never hangs the main request
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        await supabase.from('activity_logs').insert([{
            action: logData.action,
            resource_type: 'file',
            resource_id: logData.fileId || null,
            user_id: logData.user || null,
            ip_address: logData.ip || null,
            details: { status: logData.status, fileName: logData.fileName, message: logData.details }
        }]).abortSignal(controller.signal);

        clearTimeout(timeoutId);
    } catch (err) {
        console.error("[Audit Service Error]:", err.message);
    }
}