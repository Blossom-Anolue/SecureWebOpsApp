import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase admin env vars. Set SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_KEY.');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const PRIMARY_AUDIT_TABLE = process.env.AUDIT_LOG_TABLE || 'audit_logs';
const FALLBACK_AUDIT_TABLE = process.env.AUDIT_LOG_FALLBACK_TABLE || '';
const SYSTEM_AUDIT_USER_ID = process.env.SYSTEM_AUDIT_USER_ID || '00000000-0000-0000-0000-000000000000';

export const logEvent = async (eventData) => {
    const { action, fileName, user, status, ip, details } = eventData;

    const primaryPayload = [{
        action_type: action,
        file_name: fileName,
        performed_by: user || 'SYSTEM_AUTH',
        status: status,
        ip_address: ip
    }];

    const primaryResult = await supabase
        .from(PRIMARY_AUDIT_TABLE)
        .insert(primaryPayload);

    if (!primaryResult.error) return;

    if (!FALLBACK_AUDIT_TABLE) {
        console.error("FAILED TO LOG AUDIT:", {
            primaryTable: PRIMARY_AUDIT_TABLE,
            primaryError: primaryResult.error
        });
        return;
    }

    const fallbackPayload = [{
        user_id: SYSTEM_AUDIT_USER_ID,
        action: action,
        resource_type: 'encrypted_pdf',
        details: {
            file_name: fileName,
            status: status,
            performed_by: user || 'SYSTEM_AUTH',
            note: details || null
        },
        ip_address: ip
    }];

    const fallbackResult = await supabase
        .from(FALLBACK_AUDIT_TABLE)
        .insert(fallbackPayload);

    if (fallbackResult.error) {
        console.error("FAILED TO LOG AUDIT:", {
            primaryTable: PRIMARY_AUDIT_TABLE,
            primaryError: primaryResult.error,
            fallbackTable: FALLBACK_AUDIT_TABLE,
            fallbackError: fallbackResult.error
        });
    }
};
