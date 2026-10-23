/**
 * Fuse-ad API Test — getConversionReport
 * Run: node fuse_test.js
 *
 * Pulls yesterday's approved conversions for offer 6156
 * and prints what we get back.
 */

const FUSE_API_KEY = "FD4B6A940E70B37C6966407037DD7AFC";
const FUSE_BASE_URL = "https://paychat.fuseclick.com";
const OFFER_ID = "6156";
const TIMEZONE = "5"; // IST = UTC+5.5, closest int = 5

// Yesterday and today in YYYY/MM/DD format
function getDateRange() {
  const now = new Date();
  const today = now.toISOString().slice(0, 10).replace(/-/g, "/");
  const yesterday = new Date(now - 86400000)
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, "/");
  return { from: yesterday, to: today };
}

async function fetchConversions() {
  const { from, to } = getDateRange();

  const params = new URLSearchParams({
    key: FUSE_API_KEY,
    from,
    to,
    timezone: TIMEZONE,
    page: "1",
    limit: "10000",
    offer: OFFER_ID,
    advertiser: "1",
    status: "2",
    ck_click_ip: "1",
    ck_click_time: "1",
    ck_conversion_time: "1",
    ck_conversion_ip: "1",
    ck_transaction_id: "1",
    ck_income: "1",
    ck_revenue: "1",
    ck_payout: "1",
    ck_user_agent: "1",
    ck_brand: "1",
    ck_os: "1",
    ck_type: "1",
    ck_isp: "1",
    ck_sub1: "1",
    ck_sub2: "1",
    ck_sub3: "1",
    ck_sub4: "1",
    ck_sub5: "1",
    ck_offer_id: "1",
    ck_offer_name: "1",
    ck_conversion_status: "1",
    ck_click_country: "1",
  });

  const url = `${FUSE_BASE_URL}/api/v2/getConversionReport?${params}`;

  console.log("\n" + "=".repeat(60));
  console.log("  Fuse-ad Conversion Report API Test");
  console.log("=".repeat(60));
  console.log(`  Date range : ${from}  →  ${to}`);
  console.log(`  Offer      : ${OFFER_ID}`);
  console.log(`  URL        : ${url.slice(0, 120)}...`);
  console.log("=".repeat(60) + "\n");

  try {
    const resp = await fetch(url);

    if (!resp.ok) {
      const text = await resp.text();
      console.error(`❌ HTTP ${resp.status}: ${text}`);
      return;
    }

    const json = await resp.json();

    if (json.errorCode !== 0) {
      console.error(
        `❌ API error ${json.errorCode}: ${json.message || json.errorMessage}`,
      );
      console.log("Full response:", JSON.stringify(json, null, 2));
      return;
    }

    const data = json.data;
    const rows = data?.content || [];
    const total = data?.totalItems || 0;
    const pages = data?.totalPages || 0;

    console.log(`✅ API responded OK`);
    console.log(`   Total conversions : ${total}`);
    console.log(`   Total pages       : ${pages}`);
    console.log(`   Rows this page    : ${rows.length}\n`);

    if (rows.length === 0) {
      console.log("ℹ️  No conversions found for this date range / offer.");
      console.log("   Try widening the date range or check the offer ID.\n");

      // Try without date filter to see if any data exists at all
      console.log("🔍 Trying without date filter to check API connection...");
      await testConnection();
      return;
    }

    // Print first 3 rows in detail
    console.log("=".repeat(60));
    console.log("  SAMPLE ROWS (first 3)");
    console.log("=".repeat(60));

    rows.slice(0, 3).forEach((row, i) => {
      console.log(`\n--- Conversion ${i + 1} ---`);
      Object.entries(row).forEach(([k, v]) => {
        if (v !== "" && v !== null && v !== undefined) {
          console.log(`  ${k.padEnd(25)} : ${v}`);
        }
      });
    });

    // Print column summary
    console.log("\n" + "=".repeat(60));
    console.log("  ALL COLUMNS RETURNED");
    console.log("=".repeat(60));
    if (rows.length > 0) {
      Object.keys(rows[0]).forEach((k) => {
        const sample = rows[0][k];
        console.log(`  ${k.padEnd(30)} → ${JSON.stringify(sample)}`);
      });
    }

    // ECPL summary
    const totalRevenue = rows.reduce((sum, r) => {
      const rev = parseFloat(r.ck_revenue || r.ck_payout || r.ck_income || 0);
      return sum + (isNaN(rev) ? 0 : rev);
    }, 0);

    console.log("\n" + "=".repeat(60));
    console.log("  QUICK STATS");
    console.log("=".repeat(60));
    console.log(`  Conversions  : ${rows.length}`);
    console.log(`  Total revenue: $${totalRevenue.toFixed(2)}`);
    console.log(`  Avg ECPL     : $${(totalRevenue / rows.length).toFixed(2)}`);

    // Check which fields have fbclid / aff_click_id
    const hasSub5 = rows.filter((r) => r.ck_sub5 && r.ck_sub5 !== "").length;
    const hasIP = rows.filter(
      (r) => r.ck_click_ip && r.ck_click_ip !== "",
    ).length;
    console.log(`\n  Rows with sub5 (event_id) : ${hasSub5} / ${rows.length}`);
    console.log(`  Rows with click IP         : ${hasIP} / ${rows.length}`);
    console.log();
  } catch (err) {
    console.error(`❌ Fetch error: ${err.message}`);
    console.error(err);
  }
}

// Minimal test — just check the API key works at all
async function testConnection() {
  const url = `${FUSE_BASE_URL}/api/v2/getOffers?key=${FUSE_API_KEY}&status=Active&page=1&limit=5`;
  try {
    const resp = await fetch(url);
    const json = await resp.json();
    if (json.errorCode === 0) {
      console.log(
        `✅ API key is valid. Found ${json.data?.length || 0} active offers.`,
      );
      json.data?.forEach((o) => console.log(`   Offer ${o.id}: ${o.name}`));
    } else {
      console.log(`❌ API key error: ${json.message}`);
    }
  } catch (e) {
    console.error(`❌ Connection failed: ${e.message}`);
  }
}

fetchConversions();
