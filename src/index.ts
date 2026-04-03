#!/usr/bin/env node

/**
 * Meta Ads Complete - MCP Server
 *
 * A complete wrapper for the Meta Ads Manager API.
 * Manage campaigns, ad sets, ads, audiences, analytics, and budgets
 * directly from your AI assistant.
 *
 * Required env vars:
 *   META_ACCESS_TOKEN    - Meta Graph API access token
 *   META_AD_ACCOUNT_ID   - Ad account ID (format: act_XXXXXXXXX)
 *   PORT                 - Server port (default: 8080)
 */

const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StreamableHTTPServerTransport } = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
const express = require("express");
const fetch = require("node-fetch");
const { z } = require("zod");

const PORT = parseInt(process.env.PORT || "8080", 10);
const BASE_URL = "https://graph.facebook.com/v18.0";

function getCredentials() {
  const token = process.env.META_ACCESS_TOKEN;
  const accountId = process.env.META_AD_ACCOUNT_ID;
  if (!token) throw new Error("META_ACCESS_TOKEN environment variable is required");
  if (!accountId) throw new Error("META_AD_ACCOUNT_ID environment variable is required");
  return { token, accountId };
}

async function apiCall(endpoint, method = "GET", body = null, params = {}) {
  const { token } = getCredentials();
  const url = new URL(`${BASE_URL}${endpoint}`);
  url.searchParams.set("access_token", token);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) {
      url.searchParams.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
    }
  }

  const opts = { method, headers: { "Content-Type": "application/json" } };
  if (body && method !== "GET") opts.body = JSON.stringify(body);

  const res = await fetch(url.toString(), opts);
  const data = await res.json();
  if (data.error) {
    throw new Error(`Meta API Error: ${data.error.message} (code ${data.error.code})`);
  }
  return data;
}

// ── Server Setup ─────────────────────────────────────────────────

const server = new McpServer({
  name: "meta-ads-complete",
  version: "1.0.0",
});

// ── Campaign Management ───────────────────────────────────────────

server.tool(
  "list_campaigns",
  "List all campaigns in your Meta Ads account. Returns campaign IDs, names, statuses, objectives, budgets, and dates. Example: list all active campaigns to review current spend.",
  {
    status: z.enum(["ACTIVE", "PAUSED", "DELETED", "ARCHIVED"]).optional().describe("Filter by campaign status (e.g., 'ACTIVE')"),
    fields: z.string().optional().describe("Comma-separated fields to return (default: id,name,status,objective,daily_budget,lifetime_budget,start_time,stop_time)"),
  },
  async ({ status, fields }) => {
    const { accountId } = getCredentials();
    const params = {
      fields: fields || "id,name,status,objective,daily_budget,lifetime_budget,start_time,stop_time,created_time",
      limit: 100,
    };
    if (status) params.filtering = JSON.stringify([{ field: "campaign.delivery_info", operator: "IN", value: [status] }]);
    const data = await apiCall(`/${accountId}/campaigns`, "GET", null, params);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "create_campaign",
  "Create a new Meta Ads campaign. Campaigns are created in PAUSED status by default for safety. Example: create a campaign with objective CONVERSIONS for a product launch.",
  {
    name: z.string().describe("Campaign name (e.g., 'Summer Sale 2024 - Conversions')"),
    objective: z.enum([
      "OUTCOME_AWARENESS", "OUTCOME_TRAFFIC", "OUTCOME_ENGAGEMENT",
      "OUTCOME_LEADS", "OUTCOME_APP_PROMOTION", "OUTCOME_SALES",
      "CONVERSIONS", "LINK_CLICKS", "REACH", "BRAND_AWARENESS",
      "VIDEO_VIEWS", "MESSAGES", "APP_INSTALLS", "LEAD_GENERATION"
    ]).describe("Campaign objective (e.g., 'OUTCOME_SALES' for purchase conversions)"),
    status: z.enum(["ACTIVE", "PAUSED"]).optional().default("PAUSED").describe("Initial status (default: PAUSED)"),
    daily_budget: z.number().optional().describe("Daily budget in account currency (e.g., 50.00 for $50/day)"),
    lifetime_budget: z.number().optional().describe("Lifetime budget in account currency (mutually exclusive with daily_budget)"),
    special_ad_categories: z.array(z.string()).optional().default([]).describe("Required for ads in special categories: CREDIT, EMPLOYMENT, HOUSING, ISSUES_ELECTIONS_POLITICS"),
  },
  async ({ name, objective, status, daily_budget, lifetime_budget, special_ad_categories }) => {
    const { accountId } = getCredentials();
    if (!name) throw new Error("name is required");
    if (!objective) throw new Error("objective is required");
    const body = {
      name,
      objective,
      status: status || "PAUSED",
      special_ad_categories: special_ad_categories || [],
    };
    if (daily_budget) body.daily_budget = Math.round(daily_budget * 100);
    if (lifetime_budget) body.lifetime_budget = Math.round(lifetime_budget * 100);
    const data = await apiCall(`/${accountId}/campaigns`, "POST", body);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "update_campaign",
  "Update an existing campaign's name, status, budget, or other settings. Example: pause a campaign by setting status to PAUSED, or increase daily budget.",
  {
    campaign_id: z.string().describe("Campaign ID to update (e.g., '120210001234567')"),
    name: z.string().optional().describe("New campaign name"),
    status: z.enum(["ACTIVE", "PAUSED", "DELETED", "ARCHIVED"]).optional().describe("New status"),
    daily_budget: z.number().optional().describe("New daily budget in account currency"),
    lifetime_budget: z.number().optional().describe("New lifetime budget in account currency"),
  },
  async ({ campaign_id, name, status, daily_budget, lifetime_budget }) => {
    if (!campaign_id) throw new Error("campaign_id is required");
    const updates = {};
    if (name) updates.name = name;
    if (status) updates.status = status;
    if (daily_budget) updates.daily_budget = Math.round(daily_budget * 100);
    if (lifetime_budget) updates.lifetime_budget = Math.round(lifetime_budget * 100);
    if (Object.keys(updates).length === 0) throw new Error("At least one update field is required");
    const data = await apiCall(`/${campaign_id}`, "POST", updates);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "delete_campaign",
  "Delete a Meta Ads campaign permanently. This cannot be undone. Example: delete a test campaign that's no longer needed.",
  {
    campaign_id: z.string().describe("Campaign ID to delete (e.g., '120210001234567')"),
  },
  async ({ campaign_id }) => {
    if (!campaign_id) throw new Error("campaign_id is required");
    const data = await apiCall(`/${campaign_id}`, "DELETE");
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "get_campaign_insights",
  "Get performance metrics for a specific campaign: spend, impressions, reach, clicks, CTR, CPC, CPM, ROAS, and conversion actions. Example: get last 30 days performance for campaign 120210001234567.",
  {
    campaign_id: z.string().describe("Campaign ID (e.g., '120210001234567')"),
    time_range: z.enum([
      "today", "yesterday", "this_week_mon_today", "last_week_mon_sun",
      "last_7d", "last_14d", "last_28d", "last_30d", "last_90d",
      "this_month", "last_month", "this_year"
    ]).optional().default("last_30d").describe("Time range for insights (default: last_30d)"),
    breakdown: z.enum(["age", "gender", "country", "placement", "device_platform"]).optional().describe("Optional breakdown dimension"),
  },
  async ({ campaign_id, time_range, breakdown }) => {
    if (!campaign_id) throw new Error("campaign_id is required");
    const params = {
      fields: "campaign_name,spend,impressions,reach,clicks,ctr,cpc,cpm,actions,cost_per_action_type,frequency,purchase_roas",
      date_preset: time_range || "last_30d",
    };
    if (breakdown) params.breakdowns = breakdown;
    const data = await apiCall(`/${campaign_id}/insights`, "GET", null, params);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

// ── Ad Set Management ─────────────────────────────────────────────

server.tool(
  "list_ad_sets",
  "List ad sets in your account or within a specific campaign. Returns targeting, budgets, optimization goals, and delivery status. Example: list all ad sets for campaign 120210001234567.",
  {
    campaign_id: z.string().optional().describe("Filter by campaign ID (omit for all ad sets)"),
    fields: z.string().optional().describe("Comma-separated fields to return"),
  },
  async ({ campaign_id, fields }) => {
    const { accountId } = getCredentials();
    const endpoint = campaign_id ? `/${campaign_id}/adsets` : `/${accountId}/adsets`;
    const params = {
      fields: fields || "id,name,status,daily_budget,lifetime_budget,targeting,optimization_goal,bid_strategy,start_time,end_time,campaign_id",
      limit: 100,
    };
    const data = await apiCall(endpoint, "GET", null, params);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "create_ad_set",
  "Create a new ad set within a campaign. Ad sets define targeting, budgets, and optimization. Example: create an ad set targeting US adults 25-45 interested in fitness with $20/day budget.",
  {
    campaign_id: z.string().describe("Parent campaign ID"),
    name: z.string().describe("Ad set name (e.g., 'US - Age 25-45 - Fitness Interests')"),
    daily_budget: z.number().describe("Daily budget in account currency (e.g., 20.00 for $20/day)"),
    optimization_goal: z.enum([
      "NONE", "APP_INSTALLS", "BRAND_AWARENESS", "CLICKS", "ENGAGED_USERS",
      "EVENT_RESPONSES", "IMPRESSIONS", "LEAD_GENERATION", "QUALITY_LEAD",
      "LINK_CLICKS", "OFFER_CLAIMS", "OFFSITE_CONVERSIONS", "PAGE_ENGAGEMENT",
      "PAGE_LIKES", "POST_ENGAGEMENT", "QUALITY_CALL", "REACH",
      "SOCIAL_IMPRESSIONS", "VIDEO_VIEWS", "VISIT_INSTAGRAM_PROFILE", "THRUPLAY"
    ]).describe("Optimization goal (e.g., 'OFFSITE_CONVERSIONS' for purchase events)"),
    targeting: z.object({
      geo_locations: z.object({
        countries: z.array(z.string()).optional().describe("Country codes (e.g., ['US', 'CA'])"),
        cities: z.array(z.object({ key: z.string() })).optional(),
      }).optional(),
      age_min: z.number().optional().describe("Minimum age (18-65)"),
      age_max: z.number().optional().describe("Maximum age (18-65)"),
      genders: z.array(z.number()).optional().describe("1=male, 2=female"),
      interests: z.array(z.object({ id: z.string(), name: z.string() })).optional(),
      custom_audiences: z.array(z.object({ id: z.string() })).optional(),
      excluded_custom_audiences: z.array(z.object({ id: z.string() })).optional(),
    }).describe("Targeting specification"),
    billing_event: z.enum(["APP_INSTALLS", "CLICKS", "IMPRESSIONS", "LINK_CLICKS", "NONE", "OFFER_CLAIMS", "PAGE_LIKES", "POST_ENGAGEMENT", "THRUPLAY", "PURCHASE", "LISTING_INTERACTION"]).optional().default("IMPRESSIONS").describe("Billing event (default: IMPRESSIONS)"),
    status: z.enum(["ACTIVE", "PAUSED"]).optional().default("PAUSED").describe("Initial status (default: PAUSED)"),
    start_time: z.string().optional().describe("Start time in ISO 8601 format (e.g., '2024-06-01T00:00:00-0700')"),
    end_time: z.string().optional().describe("End time in ISO 8601 format"),
  },
  async ({ campaign_id, name, daily_budget, optimization_goal, targeting, billing_event, status, start_time, end_time }) => {
    const { accountId } = getCredentials();
    if (!campaign_id) throw new Error("campaign_id is required");
    if (!name) throw new Error("name is required");
    if (!daily_budget) throw new Error("daily_budget is required");
    if (!optimization_goal) throw new Error("optimization_goal is required");
    if (!targeting) throw new Error("targeting is required");
    const body = {
      campaign_id,
      name,
      daily_budget: Math.round(daily_budget * 100),
      targeting,
      optimization_goal,
      billing_event: billing_event || "IMPRESSIONS",
      status: status || "PAUSED",
    };
    if (start_time) body.start_time = start_time;
    if (end_time) body.end_time = end_time;
    const data = await apiCall(`/${accountId}/adsets`, "POST", body);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "update_ad_set",
  "Update an existing ad set's targeting, budget, status, or schedule. Example: increase daily budget from $20 to $35 for a top-performing ad set.",
  {
    ad_set_id: z.string().describe("Ad set ID to update"),
    name: z.string().optional().describe("New ad set name"),
    status: z.enum(["ACTIVE", "PAUSED", "DELETED", "ARCHIVED"]).optional().describe("New status"),
    daily_budget: z.number().optional().describe("New daily budget in account currency"),
    targeting: z.object({}).passthrough().optional().describe("Updated targeting specification"),
    end_time: z.string().optional().describe("New end time in ISO 8601 format"),
  },
  async ({ ad_set_id, name, status, daily_budget, targeting, end_time }) => {
    if (!ad_set_id) throw new Error("ad_set_id is required");
    const updates = {};
    if (name) updates.name = name;
    if (status) updates.status = status;
    if (daily_budget) updates.daily_budget = Math.round(daily_budget * 100);
    if (targeting) updates.targeting = targeting;
    if (end_time) updates.end_time = end_time;
    if (Object.keys(updates).length === 0) throw new Error("At least one update field is required");
    const data = await apiCall(`/${ad_set_id}`, "POST", updates);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "get_ad_set_insights",
  "Get performance metrics for a specific ad set: spend, impressions, reach, clicks, CTR, CPC, and conversion actions. Example: compare two ad sets targeting different age groups.",
  {
    ad_set_id: z.string().describe("Ad set ID"),
    time_range: z.enum(["today", "yesterday", "last_7d", "last_14d", "last_28d", "last_30d", "last_90d", "this_month", "last_month"]).optional().default("last_30d").describe("Time range for insights"),
    breakdown: z.enum(["age", "gender", "country", "placement", "device_platform"]).optional().describe("Optional breakdown dimension"),
  },
  async ({ ad_set_id, time_range, breakdown }) => {
    if (!ad_set_id) throw new Error("ad_set_id is required");
    const params = {
      fields: "adset_name,spend,impressions,reach,clicks,ctr,cpc,cpm,actions,cost_per_action_type,frequency",
      date_preset: time_range || "last_30d",
    };
    if (breakdown) params.breakdowns = breakdown;
    const data = await apiCall(`/${ad_set_id}/insights`, "GET", null, params);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

// ── Ad Creative Management ────────────────────────────────────────

server.tool(
  "create_ad",
  "Create a new ad within an ad set by combining a creative with targeting. Ads are created PAUSED by default. Example: create an ad using creative 120210001234568 in ad set 120210001234569.",
  {
    ad_set_id: z.string().describe("Parent ad set ID"),
    creative_id: z.string().describe("Ad creative ID to use for this ad"),
    name: z.string().describe("Ad name (e.g., 'Blue Button - Homepage Image')"),
    status: z.enum(["ACTIVE", "PAUSED"]).optional().default("PAUSED").describe("Initial status (default: PAUSED)"),
  },
  async ({ ad_set_id, creative_id, name, status }) => {
    const { accountId } = getCredentials();
    if (!ad_set_id) throw new Error("ad_set_id is required");
    if (!creative_id) throw new Error("creative_id is required");
    if (!name) throw new Error("name is required");
    const data = await apiCall(`/${accountId}/ads`, "POST", {
      adset_id: ad_set_id,
      creative: { creative_id },
      name,
      status: status || "PAUSED",
    });
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "list_ads",
  "List ads in your account or within a specific ad set. Returns ad IDs, names, statuses, creatives, and performance metrics. Example: list all ads in ad set 120210001234567.",
  {
    ad_set_id: z.string().optional().describe("Filter by ad set ID (omit for all ads)"),
    fields: z.string().optional().describe("Comma-separated fields to return"),
  },
  async ({ ad_set_id, fields }) => {
    const { accountId } = getCredentials();
    const endpoint = ad_set_id ? `/${ad_set_id}/ads` : `/${accountId}/ads`;
    const params = {
      fields: fields || "id,name,status,adset_id,campaign_id,creative{id,title,body,image_url,thumbnail_url},insights{spend,impressions,clicks,ctr,cpc}",
      limit: 100,
    };
    const data = await apiCall(endpoint, "GET", null, params);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "update_ad",
  "Update an existing ad's name, status, or creative. Example: pause an underperforming ad by setting status to PAUSED.",
  {
    ad_id: z.string().describe("Ad ID to update"),
    name: z.string().optional().describe("New ad name"),
    status: z.enum(["ACTIVE", "PAUSED", "DELETED", "ARCHIVED"]).optional().describe("New status"),
    creative_id: z.string().optional().describe("New creative ID to swap"),
  },
  async ({ ad_id, name, status, creative_id }) => {
    if (!ad_id) throw new Error("ad_id is required");
    const updates = {};
    if (name) updates.name = name;
    if (status) updates.status = status;
    if (creative_id) updates.creative = { creative_id };
    if (Object.keys(updates).length === 0) throw new Error("At least one update field is required");
    const data = await apiCall(`/${ad_id}`, "POST", updates);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "get_ad_preview",
  "Generate a preview URL for an ad creative in different placements. Example: preview how an ad will look on Facebook Feed vs Instagram Stories.",
  {
    ad_id: z.string().describe("Ad ID to preview"),
    ad_format: z.enum([
      "DESKTOP_FEED_STANDARD", "FACEBOOK_STORY_MOBILE", "INSTAGRAM_STANDARD",
      "INSTAGRAM_STORY", "MOBILE_FEED_STANDARD", "RIGHT_COLUMN_STANDARD",
      "MARKETPLACE_MOBILE", "MESSENGER_MOBILE_INBOX_MEDIA",
      "AUDIENCE_NETWORK_OUTSTREAM_VIDEO", "INSTAGRAM_REELS"
    ]).optional().default("DESKTOP_FEED_STANDARD").describe("Ad placement format for preview"),
  },
  async ({ ad_id, ad_format }) => {
    if (!ad_id) throw new Error("ad_id is required");
    const data = await apiCall(`/${ad_id}/previews`, "GET", null, {
      ad_format: ad_format || "DESKTOP_FEED_STANDARD",
    });
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

// ── Audience Management ───────────────────────────────────────────

server.tool(
  "create_custom_audience",
  "Create a new custom audience for targeting. Supports CUSTOM (customer list), WEBSITE (pixel), APP, and other subtypes. Example: create a customer list audience from email subscribers.",
  {
    name: z.string().describe("Audience name (e.g., 'Email Subscribers - June 2024')"),
    description: z.string().optional().describe("Audience description"),
    subtype: z.enum([
      "CUSTOM", "WEBSITE", "APP", "OFFLINE_CONVERSION", "CLAIM",
      "PARTNER", "MANAGED", "VIDEO", "LEAD_GENERATION", "DYNAMIC_RULE",
      "PRODUCT", "REACH", "LOOKALIKE", "ENGAGEMENT", "BAG_OF_WORDS",
      "STUDY_RULE_AUDIENCE", "FOX"
    ]).optional().default("CUSTOM").describe("Audience subtype (default: CUSTOM for customer lists)"),
    customer_file_source: z.enum([
      "USER_PROVIDED_ONLY", "PARTNER_PROVIDED_ONLY", "BOTH_USER_AND_PARTNER_PROVIDED"
    ]).optional().describe("Required for CUSTOM subtype: source of customer data"),
  },
  async ({ name, description, subtype, customer_file_source }) => {
    const { accountId } = getCredentials();
    if (!name) throw new Error("name is required");
    const body = {
      name,
      subtype: subtype || "CUSTOM",
    };
    if (description) body.description = description;
    if (customer_file_source) body.customer_file_source = customer_file_source;
    const data = await apiCall(`/${accountId}/customaudiences`, "POST", body);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "list_audiences",
  "List all custom audiences in your ad account. Returns audience IDs, names, sizes, and subtypes. Example: find all lookalike audiences based on your customer list.",
  {
    fields: z.string().optional().describe("Comma-separated fields to return (default: id,name,approximate_count,subtype,time_created,time_updated)"),
  },
  async ({ fields }) => {
    const { accountId } = getCredentials();
    const params = {
      fields: fields || "id,name,approximate_count,subtype,time_created,time_updated,description",
      limit: 100,
    };
    const data = await apiCall(`/${accountId}/customaudiences`, "GET", null, params);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "create_lookalike_audience",
  "Create a lookalike audience based on an existing custom audience. Meta will find people similar to your source audience. Example: create a 1% lookalike of your best customers in the US.",
  {
    name: z.string().describe("Lookalike audience name (e.g., 'US Lookalike 1% - Best Customers')"),
    source_audience_id: z.string().describe("Source custom audience ID to base the lookalike on"),
    country: z.string().describe("Target country code (e.g., 'US', 'GB', 'AU')"),
    ratio: z.number().optional().default(0.01).describe("Lookalike ratio 0.01-0.20 (1%-20% of target country population, default: 0.01 for 1%)"),
  },
  async ({ name, source_audience_id, country, ratio }) => {
    const { accountId } = getCredentials();
    if (!name) throw new Error("name is required");
    if (!source_audience_id) throw new Error("source_audience_id is required");
    if (!country) throw new Error("country is required");
    const data = await apiCall(`/${accountId}/customaudiences`, "POST", {
      name,
      subtype: "LOOKALIKE",
      origin_audience_id: source_audience_id,
      lookalike_spec: JSON.stringify({
        country,
        ratio: ratio || 0.01,
        type: "similarity",
      }),
    });
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

// ── Analytics & Reporting ─────────────────────────────────────────

server.tool(
  "get_account_insights",
  "Get top-level performance metrics for your entire ad account: total spend, impressions, reach, clicks, CTR, CPC, CPM, frequency, and all conversion actions. Example: get last 30 days account-level ROAS.",
  {
    time_range: z.enum([
      "today", "yesterday", "this_week_mon_today", "last_week_mon_sun",
      "last_7d", "last_14d", "last_28d", "last_30d", "last_90d",
      "this_month", "last_month", "this_year"
    ]).optional().default("last_30d").describe("Time range for insights (default: last_30d)"),
    breakdown: z.enum(["age", "gender", "country", "placement", "device_platform", "publisher_platform"]).optional().describe("Optional breakdown dimension for segmented reporting"),
  },
  async ({ time_range, breakdown }) => {
    const { accountId } = getCredentials();
    const params = {
      fields: "spend,impressions,reach,clicks,ctr,cpc,cpm,actions,action_values,cost_per_action_type,frequency,purchase_roas",
      date_preset: time_range || "last_30d",
    };
    if (breakdown) params.breakdowns = breakdown;
    const data = await apiCall(`/${accountId}/insights`, "GET", null, params);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "get_reach_estimate",
  "Estimate the potential reach for a given targeting specification before creating an ad set. Example: estimate reach for US adults 25-45 interested in fitness.",
  {
    targeting: z.object({
      geo_locations: z.object({
        countries: z.array(z.string()).optional(),
      }).optional(),
      age_min: z.number().optional(),
      age_max: z.number().optional(),
      genders: z.array(z.number()).optional(),
      interests: z.array(z.object({ id: z.string() })).optional(),
    }).describe("Targeting specification to estimate reach for"),
    optimization_goal: z.string().optional().default("REACH").describe("Optimization goal for the estimate"),
  },
  async ({ targeting, optimization_goal }) => {
    const { accountId } = getCredentials();
    if (!targeting) throw new Error("targeting is required");
    const params = {
      targeting_spec: JSON.stringify(targeting),
      optimization_goal: optimization_goal || "REACH",
    };
    const data = await apiCall(`/${accountId}/reachestimate`, "GET", null, params);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "get_ad_account_info",
  "Get detailed information about your Meta ad account: account ID, name, currency, timezone, total spend, balance, spend cap, and business details. Example: check your remaining spend cap and current balance.",
  {},
  async () => {
    const { accountId } = getCredentials();
    const data = await apiCall(`/${accountId}`, "GET", null, {
      fields: "id,name,account_status,currency,timezone_name,amount_spent,balance,spend_cap,business,owner,funding_source_details,capabilities",
    });
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

// ── Budget Management ─────────────────────────────────────────────

server.tool(
  "get_spending_limit",
  "Get the account spending limit and current spend progress. Returns spend cap, amount spent, and remaining budget. Example: check how close you are to your monthly spend cap.",
  {},
  async () => {
    const { accountId } = getCredentials();
    const data = await apiCall(`/${accountId}`, "GET", null, {
      fields: "id,name,spend_cap,amount_spent,balance,currency,account_status",
    });
    const spendCap = data.spend_cap ? parseInt(data.spend_cap) / 100 : null;
    const amountSpent = data.amount_spent ? parseInt(data.amount_spent) / 100 : null;
    const remaining = spendCap && amountSpent ? spendCap - amountSpent : null;
    const result = {
      ...data,
      spend_cap_formatted: spendCap,
      amount_spent_formatted: amountSpent,
      remaining_budget: remaining,
      currency: data.currency,
    };
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "update_daily_budget",
  "Update the daily budget for a campaign or ad set. Budgets are specified in account currency. Example: increase campaign 120210001234567 daily budget from $50 to $75.",
  {
    object_id: z.string().describe("Campaign or ad set ID to update budget for"),
    daily_budget: z.number().describe("New daily budget in account currency (e.g., 75.00 for $75/day)"),
    object_type: z.enum(["campaign", "adset"]).optional().default("campaign").describe("Whether this is a campaign or adset (default: campaign)"),
  },
  async ({ object_id, daily_budget, object_type }) => {
    if (!object_id) throw new Error("object_id is required");
    if (!daily_budget) throw new Error("daily_budget is required");
    const data = await apiCall(`/${object_id}`, "POST", {
      daily_budget: Math.round(daily_budget * 100),
    });
    return { content: [{ type: "text", text: JSON.stringify({ updated: true, object_id, object_type, new_daily_budget: daily_budget, result: data }, null, 2) }] };
  }
);

// ── Express Server ────────────────────────────────────────────────

const app = express();
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok", server: "meta-ads-complete", version: "1.0.0" });
});

app.all("/mcp", async (req, res) => {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  res.on("close", () => transport.close());
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.listen(PORT, () => {
  console.log(`Meta Ads Complete MCP server running on port ${PORT}`);
  console.log(`Health: http://localhost:${PORT}/health`);
  console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
});
