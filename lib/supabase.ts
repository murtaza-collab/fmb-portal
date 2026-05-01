import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Bypass navigator lock — avoids timeout errors when multiple queries run
    // concurrently. Safe for a single-user portal (no cross-tab token sync needed).
    lock: async <T>(_name: string, _acquireTimeout: number, fn: () => Promise<T>): Promise<T> => fn(),
  },
})