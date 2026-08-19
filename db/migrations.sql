-- ============================================================
-- Blood Donor Matching System — Supabase/PostgreSQL Migrations
-- Run in order in your Supabase SQL editor
-- ============================================================

-- ENUM TYPES
CREATE TYPE request_status AS ENUM (
  'PENDING_INFO',
  'MATCHING',
  'COMPLETED',
  'UNFULFILLABLE'
);

CREATE TYPE outreach_status AS ENUM (
  'SENT',
  'CONFIRMED',
  'DECLINED',
  'RESCHEDULED',
  'INELIGIBLE'
);

CREATE TYPE message_direction AS ENUM (
  'inbound',
  'outbound'
);

-- ============================================================
-- TABLE: donors
-- ============================================================
CREATE TABLE IF NOT EXISTS donors (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 TEXT NOT NULL,
  phone_mock           TEXT UNIQUE NOT NULL,    -- e.g. 'whatsapp:+92300000001'
  blood_group          TEXT NOT NULL,           -- 'A+','A-','B+','B-','AB+','AB-','O+','O-'
  neighbourhood        TEXT NOT NULL,
  latitude             NUMERIC(10, 7) NOT NULL,
  longitude            NUMERIC(10, 7) NOT NULL,
  last_donation_date   DATE,                    -- NULL means never donated (always eligible)
  response_history_rate NUMERIC(4, 3) DEFAULT 0.5, -- 0.0 to 1.0
  last_donation_date        DATE,    -- TRUE = skip real Twilio, log only
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_donors_blood_group ON donors(blood_group);
CREATE INDEX idx_donors_phone       ON donors(phone_mock);

-- ============================================================
-- TABLE: requests
-- ============================================================
CREATE TABLE IF NOT EXISTS requests (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_phone   TEXT NOT NULL,
  raw_input         TEXT NOT NULL,
  blood_group       TEXT,
  count_needed             INTEGER DEFAULT 1,
  hospital          TEXT,
  urgency           TEXT DEFAULT 'normal',       -- 'low','normal','high','critical'
  status            request_status DEFAULT 'PENDING_INFO',
  confirmed_count   INTEGER DEFAULT 0,
  current_wave      INTEGER DEFAULT 0,
  follow_up_question TEXT,                        -- last question asked to requester
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_requests_requester_phone ON requests(requester_phone);
CREATE INDEX idx_requests_status          ON requests(status);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER requests_updated_at
  BEFORE UPDATE ON requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- TABLE: outreach
-- ============================================================
CREATE TABLE IF NOT EXISTS outreach (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id    UUID NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  donor_id      UUID NOT NULL REFERENCES donors(id)   ON DELETE CASCADE,
  donor_phone   TEXT NOT NULL,
  wave_number   INTEGER NOT NULL DEFAULT 1,
  status        outreach_status DEFAULT 'SENT',
  sent_at       TIMESTAMPTZ DEFAULT NOW(),
  responded_at  TIMESTAMPTZ,
  reschedule_time TEXT,
  UNIQUE(request_id, donor_id)  -- a donor can only be in one wave per request
);

CREATE INDEX idx_outreach_donor_phone ON outreach(donor_phone);
CREATE INDEX idx_outreach_request_id  ON outreach(request_id);
CREATE INDEX idx_outreach_status      ON outreach(status);

-- ============================================================
-- TABLE: messages_log
-- ============================================================
CREATE TABLE IF NOT EXISTS messages_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone       TEXT NOT NULL,
  direction   message_direction NOT NULL,
  body        TEXT NOT NULL,
  request_id  UUID REFERENCES requests(id) ON DELETE SET NULL,
  donor_id    UUID REFERENCES donors(id)   ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_messages_log_phone      ON messages_log(phone);
CREATE INDEX idx_messages_log_request_id ON messages_log(request_id);
