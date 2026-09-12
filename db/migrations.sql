-- ============================================================
-- Blood Donor Matching System — Supabase/PostgreSQL Migrations
-- REBUILT to match the LIVE database schema exactly.
-- Run in order in your Supabase SQL editor on a clean environment.
-- Last updated: 2026-08-30
-- ============================================================

-- ============================================================
-- ENUM TYPES (request_status includes PENDING_APPROVAL)
-- ============================================================
DO $$ BEGIN
  CREATE TYPE request_status AS ENUM (
    'PENDING_INFO',
    'PENDING_APPROVAL',
    'PENDING_VERIFICATION',
    'MATCHING',
    'COMPLETED',
    'UNFULFILLABLE'
  );
EXCEPTION WHEN duplicate_object THEN
  ALTER TYPE request_status ADD VALUE IF NOT EXISTS 'PENDING_APPROVAL';
  ALTER TYPE request_status ADD VALUE IF NOT EXISTS 'PENDING_VERIFICATION';
END $$;

DO $$ BEGIN
  CREATE TYPE outreach_status AS ENUM (
    'SENT',
    'CONFIRMED',
    'DECLINED',
    'RESCHEDULED',
    'INELIGIBLE'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE message_direction AS ENUM (
    'inbound',
    'outbound'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ============================================================
-- TABLE: donors
-- Live schema confirmed columns (2026-08-30):
--   id, name, phone, blood_group, neighbourhood,
--   lat, lng, last_donation_date, response_history_score, last_contacted_at
-- ============================================================
CREATE TABLE IF NOT EXISTS donors (
  id                      SERIAL PRIMARY KEY,
  name                    TEXT NOT NULL,
  phone                   TEXT UNIQUE NOT NULL,    -- e.g. 'whatsapp:+92300000001'
  blood_group             TEXT NOT NULL,           -- 'A+','A-','B+','B-','AB+','AB-','O+','O-'
  neighbourhood           TEXT NOT NULL,
  lat                     NUMERIC(10, 7) NOT NULL,
  lng                     NUMERIC(10, 7) NOT NULL,
  last_donation_date      DATE,                    -- NULL = never donated (always eligible)
  response_history_score  NUMERIC(4, 3) DEFAULT 0.5, -- 0.0 to 1.0
  last_contacted_at       TIMESTAMPTZ,
  is_test_donor           BOOLEAN DEFAULT TRUE     -- TRUE = skip real Twilio, simulate only
);

CREATE INDEX IF NOT EXISTS idx_donors_blood_group ON donors(blood_group);
CREATE INDEX IF NOT EXISTS idx_donors_phone       ON donors(phone);


-- ============================================================
-- TABLE: requests
-- Live schema confirmed columns (2026-08-30):
--   id, requester_phone, raw_input, blood_group, count, hospital,
--   location, urgency, status, confirmed_count, created_at,
--   current_wave, follow_up_question, updated_at
-- ============================================================
CREATE TABLE IF NOT EXISTS requests (
  id                  SERIAL PRIMARY KEY,
  requester_phone     TEXT NOT NULL,
  raw_input           TEXT NOT NULL,
  blood_group         TEXT,
  count               INTEGER DEFAULT 1,
  hospital            TEXT,
  location            TEXT,                      -- free-text location override
  urgency             TEXT DEFAULT 'normal',     -- 'low','normal','high','critical'
  status              request_status DEFAULT 'PENDING_INFO',
  confirmed_count     INTEGER DEFAULT 0,
  current_wave        INTEGER DEFAULT 0,
  follow_up_question  TEXT,                      -- last question asked / verification reason
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_requests_requester_phone ON requests(requester_phone);
CREATE INDEX IF NOT EXISTS idx_requests_status          ON requests(status);

-- Auto-update updated_at on every row change
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS requests_updated_at ON requests;
CREATE TRIGGER requests_updated_at
  BEFORE UPDATE ON requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ============================================================
-- TABLE: outreach
-- Live schema confirmed columns (2026-08-30):
--   id, request_id, donor_id, wave_number, status, sent_at, responded_at
--   (reschedule_time added via ALTER below)
-- ============================================================
CREATE TABLE IF NOT EXISTS outreach (
  id              SERIAL PRIMARY KEY,
  request_id      INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  donor_id        INTEGER NOT NULL REFERENCES donors(id)   ON DELETE CASCADE,
  wave_number     INTEGER NOT NULL DEFAULT 1,
  status          outreach_status DEFAULT 'SENT',
  sent_at         TIMESTAMPTZ DEFAULT NOW(),
  responded_at    TIMESTAMPTZ,
  reschedule_time TEXT,
  UNIQUE(request_id, donor_id)
);

CREATE TABLE IF NOT EXISTS verified_hospitals (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  city TEXT,
  active BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS verified_doctors (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  reg_number TEXT NOT NULL,
  hospital_name TEXT,
  active BOOLEAN DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_outreach_request_id ON outreach(request_id);
CREATE INDEX IF NOT EXISTS idx_outreach_status     ON outreach(status);


-- ============================================================
-- TABLE: messages_log
-- Live schema confirmed columns (2026-08-30):
--   id, phone, direction, body, request_id, donor_id, created_at
-- ============================================================
CREATE TABLE IF NOT EXISTS messages_log (
  id          SERIAL PRIMARY KEY,
  phone       TEXT NOT NULL,
  direction   message_direction NOT NULL,
  body        TEXT NOT NULL,
  request_id  INTEGER REFERENCES requests(id) ON DELETE SET NULL,
  donor_id    INTEGER REFERENCES donors(id)   ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_log_phone      ON messages_log(phone);
CREATE INDEX IF NOT EXISTS idx_messages_log_request_id ON messages_log(request_id);


-- ============================================================
-- TABLE: agent_trajectories (NEW — for real trajectory logging)
-- ============================================================
CREATE TABLE IF NOT EXISTS agent_trajectories (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id       INTEGER REFERENCES requests(id) ON DELETE CASCADE,
  agent_name       TEXT NOT NULL,
  step_number      INTEGER NOT NULL,
  prompt_tokens    INTEGER,
  completion_tokens INTEGER,
  latency_ms       INTEGER,
  trajectory_data  JSONB NOT NULL,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trajectories_request_id ON agent_trajectories(request_id);


-- ============================================================
-- SAFE ALTER STATEMENTS (idempotent additions to live DB)
-- Run these if the table already exists with base columns.
-- ============================================================
ALTER TABLE requests ADD COLUMN IF NOT EXISTS current_wave       INTEGER DEFAULT 0;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS follow_up_question TEXT;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS updated_at         TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE requests ADD COLUMN IF NOT EXISTS location           TEXT;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS buffer_ratio       INTEGER DEFAULT 3;

ALTER TABLE donors ADD COLUMN IF NOT EXISTS is_test_donor        BOOLEAN DEFAULT TRUE;
ALTER TABLE donors ADD COLUMN IF NOT EXISTS last_contacted_at    TIMESTAMPTZ;

ALTER TABLE outreach ADD COLUMN IF NOT EXISTS reschedule_time    TEXT;
