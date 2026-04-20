import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error(
    'Missing Supabase admin env vars. Set SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_KEY (or SUPABASE_SERVICE_ROLE_KEY).'
  );
}

const cleanedKey = supabaseServiceKey.trim().replace(/^["']|["']$/g, '');

if (cleanedKey.endsWith('>')) {
  throw new Error(
    '\n\n❌ CRITICAL ERROR: Your SUPABASE_SERVICE_KEY in the .env file is truncated/broken!\n' +
    'It ends with a ">" character, which means it was cut off when you copied it from your terminal or browser.\n' +
    'Please open your .env file, delete the broken key, and paste the FULL service_role secret key from your Supabase Dashboard -> Project Settings -> API.\n' +
    'Restart the server after saving.\n\n'
  );
}

if (cleanedKey.split('.').length !== 3) {
  console.warn(
    '\n\n⚠️ WARNING: Your SUPABASE_SERVICE_KEY does not look like a complete JWT (it should have 3 parts separated by dots).\n' +
    'If you get "Invalid API key" or "Invalid or expired bearer token" errors, your key is likely incomplete.\n\n'
  );
}

export const supabaseAdmin = createClient(supabaseUrl, cleanedKey);
