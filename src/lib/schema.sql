-- MySQL schema: accounts/auth, integrations, reports, analytics, and the
-- archived tracker + journey sections (tables kept so no data is lost).
-- Run via `npm run db:init` after a fresh phpMyAdmin database is created.
-- Designed to be idempotent: every statement is CREATE IF NOT EXISTS.
--
-- Hot fields we filter/sort on (event_date, revenue, conversion_id,
-- sub1/sub2/sub3) live as discrete columns + indexes so insights stay
-- fast on a few-million-row event table. Everything else from the CSV is
-- dumped into `event_data` (or `raw`) as JSON so we never lose a column
-- even when the upstream provider adds new fields.

-- =============================================================================
-- Accounts + auth
-- =============================================================================

CREATE TABLE IF NOT EXISTS users (
  id              VARCHAR(32)  NOT NULL PRIMARY KEY,
  email           VARCHAR(255) NOT NULL,
  name            VARCHAR(120) NOT NULL,
  password_hash   VARCHAR(255) NOT NULL,
  created_at      DATETIME     NOT NULL,
  last_login_at   DATETIME     NULL,
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Session id is the SHA-256 of the cookie value, so a leaked table can't be
-- replayed as a cookie.
CREATE TABLE IF NOT EXISTS sessions (
  id              CHAR(64)     NOT NULL PRIMARY KEY,
  user_id         VARCHAR(32)  NOT NULL,
  created_at      DATETIME     NOT NULL,
  expires_at      DATETIME     NOT NULL,
  user_agent      VARCHAR(512) NULL,
  ip              VARCHAR(64)  NULL,
  KEY idx_sessions_user (user_id),
  KEY idx_sessions_expiry (expires_at),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- Integrations: one row per (user, provider). Tokens are AES-256-GCM
-- encrypted with TOKEN_ENCRYPTION_KEY and never leave the server.
-- =============================================================================

CREATE TABLE IF NOT EXISTS integrations (
  id                VARCHAR(32)  NOT NULL PRIMARY KEY,
  user_id           VARCHAR(32)  NOT NULL,
  provider          VARCHAR(32)  NOT NULL,
  external_user_id  VARCHAR(128) NULL,
  external_name     VARCHAR(255) NULL,
  access_token_enc  TEXT         NOT NULL,
  token_expires_at  DATETIME     NULL,
  scopes            VARCHAR(512) NULL,
  method            ENUM('oauth','token') NOT NULL DEFAULT 'oauth',
  status            ENUM('active','expired','error') NOT NULL DEFAULT 'active',
  connected_at      DATETIME     NOT NULL,
  synced_at         DATETIME     NULL,
  UNIQUE KEY uq_integration (user_id, provider),
  CONSTRAINT fk_integrations_user FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Ad accounts (or equivalent) discovered through an integration.
CREATE TABLE IF NOT EXISTS integration_accounts (
  integration_id  VARCHAR(32)  NOT NULL,
  account_id      VARCHAR(64)  NOT NULL,
  name            VARCHAR(255) NULL,
  currency        VARCHAR(8)   NULL,
  timezone        VARCHAR(64)  NULL,
  account_status  INT          NULL,
  business_name   VARCHAR(255) NULL,
  PRIMARY KEY (integration_id, account_id),
  CONSTRAINT fk_int_accounts FOREIGN KEY (integration_id)
    REFERENCES integrations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- Reports: any uploaded xlsx/csv (Meta Ads Manager exports or otherwise).
-- Rows are stored as JSON arrays aligned with `columns`.
-- =============================================================================

CREATE TABLE IF NOT EXISTS reports (
  id              VARCHAR(32)  NOT NULL PRIMARY KEY,
  user_id         VARCHAR(32)  NOT NULL,
  name            VARCHAR(255) NOT NULL,
  filename        VARCHAR(512) NULL,
  source          VARCHAR(32)  NULL,
  columns_json    JSON         NOT NULL,
  row_count       INT          NOT NULL DEFAULT 0,
  date_from       DATE         NULL,
  date_to         DATE         NULL,
  summary_json    JSON         NULL,
  created_at      DATETIME     NOT NULL,
  KEY idx_reports_user (user_id, created_at),
  CONSTRAINT fk_reports_user FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS report_rows (
  report_id       VARCHAR(32)  NOT NULL,
  idx             INT          NOT NULL,
  data            JSON         NOT NULL,
  PRIMARY KEY (report_id, idx),
  CONSTRAINT fk_report_rows FOREIGN KEY (report_id)
    REFERENCES reports(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- Analytics (conversion CSVs). Scoped per user via user_id.
-- =============================================================================

CREATE TABLE IF NOT EXISTS analytics_campaigns (
  id              VARCHAR(64)  NOT NULL PRIMARY KEY,
  user_id         VARCHAR(32)  NULL,
  name            VARCHAR(255) NOT NULL,
  created_at      DATETIME     NOT NULL,
  last_upload_at  DATETIME     NULL,
  linked_metas    JSON         NULL,
  meta            JSON         NULL,
  KEY idx_campaign_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS analytics_uploads (
  id              VARCHAR(64)  NOT NULL PRIMARY KEY,
  campaign_id     VARCHAR(64)  NOT NULL,
  filename        VARCHAR(512) NULL,
  uploaded_at     DATETIME     NOT NULL,
  rows_read       INT          NOT NULL DEFAULT 0,
  added           INT          NOT NULL DEFAULT 0,
  duplicates      INT          NOT NULL DEFAULT 0,
  skipped         INT          NOT NULL DEFAULT 0,
  enabled         TINYINT(1)   NOT NULL DEFAULT 1,
  KEY idx_upload_campaign (campaign_id, uploaded_at),
  CONSTRAINT fk_upload_campaign FOREIGN KEY (campaign_id)
    REFERENCES analytics_campaigns(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS analytics_events (
  id              BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  campaign_id     VARCHAR(64)  NOT NULL,
  upload_id       VARCHAR(64)  NOT NULL,
  conversion_id   VARCHAR(128) NULL,
  transaction_id  VARCHAR(128) NULL,
  event_name      VARCHAR(128) NULL,
  event_date      DATETIME     NULL,
  click_date      DATETIME     NULL,
  delta_hours     DECIMAL(12,4) NULL,
  revenue         DECIMAL(15,4) NULL,
  revenue_type    VARCHAR(64)  NULL,
  offer_id        VARCHAR(64)  NULL,
  offer_name      VARCHAR(255) NULL,
  sub1            VARCHAR(255) NULL,
  sub2            VARCHAR(255) NULL,
  sub3            VARCHAR(255) NULL,
  country_code    VARCHAR(8)   NULL,
  region          VARCHAR(128) NULL,
  city            VARCHAR(128) NULL,
  device_type     VARCHAR(64)  NULL,
  os              VARCHAR(64)  NULL,
  browser         VARCHAR(64)  NULL,
  event_data      JSON         NULL,
  KEY idx_event_campaign (campaign_id, event_date),
  KEY idx_event_upload (upload_id),
  KEY idx_event_conv (campaign_id, conversion_id),
  CONSTRAINT fk_event_campaign FOREIGN KEY (campaign_id)
    REFERENCES analytics_campaigns(id) ON DELETE CASCADE,
  CONSTRAINT fk_event_upload FOREIGN KEY (upload_id)
    REFERENCES analytics_uploads(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tracker_settings (
  id          TINYINT      NOT NULL PRIMARY KEY DEFAULT 1,
  sheet_url   TEXT         NULL,
  updated_at  DATETIME     NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tracker_names (
  entity_type ENUM('campaign','adset','ad') NOT NULL,
  entity_id   VARCHAR(128) NOT NULL,
  name        VARCHAR(512) NULL,
  account     VARCHAR(64)  NULL,
  synced_at   DATETIME     NULL,
  PRIMARY KEY (entity_type, entity_id),
  KEY idx_names_account (account)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tracker_sync_meta (
  id          TINYINT      NOT NULL PRIMARY KEY DEFAULT 1,
  account     VARCHAR(64)  NULL,
  synced_at   DATETIME     NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- Journey section: pairs the Fuse click report (one row per CTA click) with
-- the Conv report (one row per funnel event) so we can map the full
-- landing → click → conversion timeline for each user.
-- =============================================================================

CREATE TABLE IF NOT EXISTS journey_clicks (
  id                     BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  offer_name             VARCHAR(255) NULL,
  affiliate_name         VARCHAR(255) NULL,
  sub_affiliate_id       VARCHAR(128) NULL,
  event_id               VARCHAR(64)  NULL,
  event_name             VARCHAR(128) NULL,
  traffic_source         VARCHAR(64)  NULL,
  sub_id_1               VARCHAR(255) NULL,
  sub_id_2               VARCHAR(255) NULL,
  affiliate_click_id     VARCHAR(512) NULL,
  device_id              VARCHAR(128) NULL,
  device_type            VARCHAR(64)  NULL,
  device_brand           VARCHAR(64)  NULL,
  device_model           VARCHAR(128) NULL,
  device_os              VARCHAR(64)  NULL,
  device_os_version      VARCHAR(64)  NULL,
  carrier                VARCHAR(128) NULL,
  transaction_id         VARCHAR(128) NULL,
  click_country          VARCHAR(8)   NULL,
  click_state            VARCHAR(128) NULL,
  click_city             VARCHAR(128) NULL,
  tracking_link_referral VARCHAR(512) NULL,
  session_ip             VARCHAR(64)  NULL,
  browser                VARCHAR(128) NULL,
  session_time           DATETIME     NULL,
  payout                 DECIMAL(15,4) NULL,
  revenue                DECIMAL(15,4) NULL,
  conversion_ip          VARCHAR(64)  NULL,
  conversion_time        DATETIME     NULL,
  conversion_message     VARCHAR(512) NULL,
  status                 VARCHAR(64)  NULL,
  raw                    JSON         NULL,
  UNIQUE KEY uq_click (transaction_id, session_time),
  KEY idx_jc_fbclid (affiliate_click_id(191)),
  KEY idx_jc_ip (session_ip),
  KEY idx_jc_session_time (session_time),
  KEY idx_jc_offer (offer_name),
  KEY idx_jc_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS journey_conversions (
  id                  BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  conversion_id       VARCHAR(128) NOT NULL,
  transaction_id      VARCHAR(128) NULL,
  conv_date           DATETIME     NULL,
  click_date          DATETIME     NULL,
  delta_hours         DECIMAL(12,4) NULL,
  offer_id            VARCHAR(64)  NULL,
  offer_name          VARCHAR(255) NULL,
  creative_id         VARCHAR(64)  NULL,
  event_id            VARCHAR(64)  NULL,
  event_name          VARCHAR(128) NULL,
  revenue             DECIMAL(15,4) NULL,
  revenue_type        VARCHAR(64)  NULL,
  source_id           VARCHAR(64)  NULL,
  sub1                VARCHAR(255) NULL,
  sub2                VARCHAR(255) NULL,
  sub3                VARCHAR(255) NULL,
  sub4                VARCHAR(255) NULL,
  sub5                VARCHAR(255) NULL,
  session_user_ip     VARCHAR(64)  NULL,
  conversion_user_ip  VARCHAR(64)  NULL,
  user_agent          TEXT         NULL,
  country             VARCHAR(128) NULL,
  country_code        VARCHAR(8)   NULL,
  region              VARCHAR(128) NULL,
  city                VARCHAR(128) NULL,
  dma                 VARCHAR(32)  NULL,
  carrier             VARCHAR(128) NULL,
  platform            VARCHAR(64)  NULL,
  os_version          VARCHAR(64)  NULL,
  device_type         VARCHAR(64)  NULL,
  brand               VARCHAR(64)  NULL,
  browser             VARCHAR(128) NULL,
  language            VARCHAR(32)  NULL,
  isp                 VARCHAR(255) NULL,
  referer             VARCHAR(512) NULL,
  idfa                VARCHAR(128) NULL,
  google_ad_id        VARCHAR(128) NULL,
  android_id          VARCHAR(128) NULL,
  currency_id         VARCHAR(8)   NULL,
  sale_amount         DECIMAL(15,4) NULL,
  network_id          VARCHAR(64)  NULL,
  raw                 JSON         NULL,
  UNIQUE KEY uq_conversion (conversion_id),
  KEY idx_conv_tx (transaction_id),
  KEY idx_conv_ip (session_user_ip),
  KEY idx_conv_date (conv_date),
  KEY idx_conv_offer (offer_name),
  KEY idx_conv_event (event_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
