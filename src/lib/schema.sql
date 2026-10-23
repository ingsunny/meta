-- MySQL schema for the analytics + tracker + journey sections.
-- Run via `npm run db:init` after a fresh phpMyAdmin database is created.
-- Designed to be idempotent: every statement is CREATE IF NOT EXISTS.
--
-- Hot fields we filter/sort on (event_date, revenue, conversion_id,
-- sub1/sub2/sub3) live as discrete columns + indexes so insights stay
-- fast on a few-million-row event table. Everything else from the CSV is
-- dumped into `event_data` (or `raw`) as JSON so we never lose a column
-- even when the upstream provider adds new fields.

CREATE TABLE IF NOT EXISTS analytics_campaigns (
  id              VARCHAR(64)  NOT NULL PRIMARY KEY,
  name            VARCHAR(255) NOT NULL,
  created_at      DATETIME     NOT NULL,
  last_upload_at  DATETIME     NULL,
  linked_metas    JSON         NULL,
  meta            JSON         NULL
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
