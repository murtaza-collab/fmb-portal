-- ============================================================
-- WhatsApp Phase 1 Migration
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. WAHA Session Config
CREATE TABLE IF NOT EXISTS wa_config (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_name text        NOT NULL DEFAULT 'fmb_portal',
  phone_number text,
  mode         text        NOT NULL DEFAULT 'testing' CHECK (mode IN ('testing', 'production')),
  is_active    boolean     NOT NULL DEFAULT true,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Insert default row (skip if already exists)
INSERT INTO wa_config (session_name, mode)
SELECT 'fmb_portal', 'testing'
WHERE NOT EXISTS (SELECT 1 FROM wa_config);

-- 2. Broadcast Queue
CREATE TABLE IF NOT EXISTS wa_broadcast_queue (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_name    text        NOT NULL,
  mumin_id         uuid,
  phone            text        NOT NULL,
  rendered_message text        NOT NULL,
  status           text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
  attempts         int         NOT NULL DEFAULT 0,
  error_message    text,
  waha_message_id  text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Idempotency: one row per (campaign, mumin)
CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_queue_campaign_mumin
  ON wa_broadcast_queue (campaign_name, mumin_id)
  WHERE mumin_id IS NOT NULL;

-- Efficient polling by n8n
CREATE INDEX IF NOT EXISTS idx_wa_queue_status_created
  ON wa_broadcast_queue (status, created_at);

-- 3. Extend notification_templates
ALTER TABLE notification_templates ADD COLUMN IF NOT EXISTS channel    text    DEFAULT 'fcm';
ALTER TABLE notification_templates ADD COLUMN IF NOT EXISTS variables  jsonb   DEFAULT '[]'::jsonb;
ALTER TABLE notification_templates ADD COLUMN IF NOT EXISTS is_whatsapp boolean DEFAULT false;

-- 4. Extend notification_logs
ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS channel         text        DEFAULT 'fcm';
ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS waha_message_id text;
ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS delivery_status text;
ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS recipient_phone text;
ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS sent_at         timestamptz DEFAULT now();
