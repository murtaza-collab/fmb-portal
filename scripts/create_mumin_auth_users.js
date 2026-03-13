/**
 * create_mumin_auth_users.js
 * 
 * One-time bulk script to create Supabase Auth users for all mumineen
 * who have been imported via CSV but don't yet have auth accounts.
 * 
 * Usage:
 *   node create_mumin_auth_users.js
 * 
 * Prerequisites:
 *   npm install @supabase/supabase-js
 *   Set env vars: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 * 
 * Auth format:
 *   email    → sfno@fmb.internal   (e.g. SF-001@fmb.internal)
 *   password → ITS number           (e.g. 12345678)
 * 
 * Run AFTER importing real CSV data into mumineen table.
 * Safe to re-run — skips mumineen who already have auth_id set.
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ Missing env vars: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function createMuminAuthUsers() {
  console.log('🔄 Fetching mumineen without auth accounts...\n');

  // Fetch all mumineen who don't have an auth_id yet
  const { data: mumineen, error } = await supabase
    .from('mumineen')
    .select('id, sf_no, its_no, full_name')
    .is('auth_id', null)
    .eq('status', 'active')
    .order('id');

  if (error) {
    console.error('❌ Failed to fetch mumineen:', error.message);
    process.exit(1);
  }

  console.log(`Found ${mumineen.length} mumineen without auth accounts.\n`);

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const mumin of mumineen) {
    const email = `${mumin.sf_no}@fmb.internal`.toLowerCase();
    const password = mumin.its_no || mumin.sf_no; // fallback to sf_no if no ITS

    if (!password) {
      console.warn(`⚠️  Skipping ${mumin.full_name} (${mumin.sf_no}) — no ITS# or SF# for password`);
      skipped++;
      continue;
    }

    try {
      // Create auth user
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true, // auto-confirm, no email verification needed
        user_metadata: {
          mumin_id: mumin.id,
          sf_no: mumin.sf_no,
          full_name: mumin.full_name
        }
      });

      if (authError) {
        if (authError.message.includes('already been registered')) {
          // User exists — try to link by email
          const { data: existingUsers } = await supabase.auth.admin.listUsers();
          const existing = existingUsers?.users?.find(u => u.email === email);
          if (existing) {
            await supabase
              .from('mumineen')
              .update({ auth_id: existing.id })
              .eq('id', mumin.id);
            console.log(`🔗 Linked existing: ${mumin.full_name} (${mumin.sf_no})`);
            created++;
          } else {
            console.warn(`⚠️  Already registered but not found: ${email}`);
            skipped++;
          }
        } else {
          console.error(`❌ Failed: ${mumin.full_name} (${mumin.sf_no}) — ${authError.message}`);
          failed++;
        }
        continue;
      }

      // Link auth_id back to mumineen row
      const { error: updateError } = await supabase
        .from('mumineen')
        .update({ auth_id: authData.user.id })
        .eq('id', mumin.id);

      if (updateError) {
        console.error(`❌ Created auth but failed to link: ${mumin.full_name} — ${updateError.message}`);
        failed++;
      } else {
        console.log(`✅ Created: ${mumin.full_name} (${mumin.sf_no}) → ${email}`);
        created++;
      }

      // Small delay to avoid hitting rate limits
      await new Promise(r => setTimeout(r, 100));

    } catch (err) {
      console.error(`❌ Unexpected error for ${mumin.full_name}:`, err.message);
      failed++;
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log(`✅ Created : ${created}`);
  console.log(`⚠️  Skipped : ${skipped}`);
  console.log(`❌ Failed  : ${failed}`);
  console.log(`📊 Total   : ${mumineen.length}`);
  console.log('='.repeat(50));
  
  if (failed > 0) {
    console.log('\n⚠️  Some users failed. Re-run the script to retry — it skips already-linked mumineen.');
  } else {
    console.log('\n🎉 Done! All mumineen can now log in to the Flutter app.');
  }
}

createMuminAuthUsers();