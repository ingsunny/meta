// Generates Meta's official rendered preview iframe for a given ad and
// placement format. Meta returns an <iframe>...</iframe> HTML snippet which
// we hand back as-is so the client can drop it into srcDoc.

import { NextResponse } from "next/server";
import axios from "axios";
import { getMetaToken, metaNotConnected } from "@/lib/meta/accounts";

const API_VERSION = "v25.0";

// Meta's documented ad_format enum. We expose the most useful placements.
const ALLOWED_FORMATS = new Set([
  "MOBILE_FEED_STANDARD",
  "DESKTOP_FEED_STANDARD",
  "INSTAGRAM_STANDARD",
  "INSTAGRAM_STORY",
  "INSTAGRAM_REELS",
  "FACEBOOK_STORY_MOBILE",
  "MOBILE_NATIVE",
  "MOBILE_BANNER",
  "MOBILE_INTERSTITIAL",
  "MOBILE_MEDIUM_RECTANGLE",
  "AUDIENCE_NETWORK_OUTSTREAM_VIDEO",
  "MARKETPLACE_MOBILE",
  "MESSENGER_MOBILE_INBOX_MEDIA",
  "RIGHT_COLUMN_STANDARD",
  "INSTANT_ARTICLE_STANDARD",
]);

export async function GET(req) {
  const token = await getMetaToken();
  if (!token) return metaNotConnected();
  const { searchParams } = new URL(req.url);
  const adId = searchParams.get("ad");
  const requestedFormat = searchParams.get("format") || "MOBILE_FEED_STANDARD";
  const format = ALLOWED_FORMATS.has(requestedFormat)
    ? requestedFormat
    : "MOBILE_FEED_STANDARD";

  if (!adId) {
    return NextResponse.json({ error: "Missing ad id" }, { status: 400 });
  }

  try {
    const res = await axios.get(
      `https://graph.facebook.com/${API_VERSION}/${adId}/previews`,
      {
        params: {
          ad_format: format,
          access_token: token,
        },
      },
    );
    const body = res.data?.data?.[0]?.body || null;
    return NextResponse.json({ success: true, format, body });
  } catch (error) {
    const detail = error.response?.data?.error?.message || error.message;
    console.error("Preview Error:", detail);
    return NextResponse.json(
      { error: "Failed to render preview", detail, format },
      { status: 500 },
    );
  }
}
