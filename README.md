Stop switching tabs to manage Meta campaigns. Control your entire Meta Ads account from your AI assistant.

# Meta Ads Complete MCP Server

A production-grade MCP server that wraps all Meta Ads Manager capabilities. Manage campaigns, ad sets, audiences, creatives, and analytics without leaving your AI assistant.

## Tools

| Tool | Description |
|------|-------------|
| `list_campaigns` | List all campaigns with status, objectives, and budgets |
| `create_campaign` | Create a new campaign with objective and budget |
| `update_campaign` | Update campaign name, status, or budget |
| `delete_campaign` | Delete a campaign permanently |
| `get_campaign_insights` | Get spend, impressions, clicks, CTR, ROAS for a campaign |
| `list_ad_sets` | List ad sets with targeting and delivery info |
| `create_ad_set` | Create an ad set with audience targeting and budget |
| `update_ad_set` | Update ad set targeting, budget, or schedule |
| `get_ad_set_insights` | Get performance metrics for an ad set |
| `create_ad` | Create an ad by combining a creative with an ad set |
| `list_ads` | List ads with creative details and performance |
| `update_ad` | Update ad name, status, or swap creative |
| `get_ad_preview` | Generate preview URLs for any ad placement |
| `create_custom_audience` | Create a custom audience from customer data |
| `list_audiences` | List all custom audiences with sizes and types |
| `create_lookalike_audience` | Create a lookalike audience from existing audience |
| `get_account_insights` | Get account-level spend, reach, and conversions |
| `get_reach_estimate` | Estimate audience size before launching |
| `get_ad_account_info` | Get account details, currency, and balance |
| `get_spending_limit` | Check spend cap and remaining budget |
| `update_daily_budget` | Update daily budget for campaign or ad set |

## Quick Start

### Requirements

- Meta Graph API access token (long-lived user token or system user token)
- Meta Ad Account ID (format: `act_XXXXXXXXX`)

### Connection Config

```json
{
  "mcpServers": {
    "meta-ads-complete": {
      "url": "https://your-deployment-url/mcp",
      "env": {
        "META_ACCESS_TOKEN": "your-access-token-here",
        "META_AD_ACCOUNT_ID": "act_XXXXXXXXX"
      }
    }
  }
}
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `META_ACCESS_TOKEN` | Yes | Meta Graph API access token |
| `META_AD_ACCOUNT_ID` | Yes | Ad account ID (format: act_XXXXXXXXX) |
| `PORT` | No | Server port (default: 8080) |

## Getting Your Credentials

1. Go to [Meta Business Manager](https://business.facebook.com)
2. Navigate to Business Settings > Users > System Users
3. Create a system user with Admin access
4. Generate an access token with `ads_management` and `ads_read` permissions
5. Your Ad Account ID is visible in Ads Manager URL: `facebook.com/adsmanager/manage/campaigns?act=XXXXXXXXX`

## Example Usage

Ask your AI assistant:

- "Show me all active campaigns and their spend this month"
- "Create a new CONVERSIONS campaign called 'Product Launch - Q3' with $50/day budget"
- "Pause all ad sets spending more than $100/day with CTR below 1%"
- "Create a 1% lookalike audience in the US based on my customer list"
- "What was my account ROAS last 30 days broken down by placement?"

---

Built by [mastermindshq.business](https://mastermindshq.business)
