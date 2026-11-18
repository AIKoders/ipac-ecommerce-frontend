# Vercel firewall — ipac storefront

Project `ipac-ecommerce`, team `aikoders`. Like every AIKoders app on Vercel it runs **Bot Protection: Challenge**: a browser solves the challenge without noticing, anything else gets `429` with `x-vercel-mitigated: challenge`. Search engines and link-preview fetchers on Vercel's verified-bot list pass on their own.

The store is public, so only a few paths need a rule. Changes to the firewall are the owner's call; everything below was applied on 2026-11-18 with their go-ahead, and the commands stay here to recreate or audit it. Rules are staged as a draft and go live with `publish`.

Live configuration: firewall enabled, Bot Protection **Challenge**, AI bots **Allow**, and the three rules in section 2.

## 1. Managed rulesets

Vercel → `ipac-ecommerce` → Firewall → Bot Management, or through the API (`managedRules.update` with id `bot_protection`, value `{"active": true, "action": "challenge"}` on `PATCH /v1/security/firewall/config?projectId=ipac-ecommerce`):

| Ruleset | Setting | Why |
|---|---|---|
| Bot Protection | **Challenge** | The house standard |
| AI Bots | **Allow** (the default) | The store publishes `llms.txt` and wants to be cited by AI search |

## 2. Rules

### KPulse checks

Lets KPulse's uptime checks past Bot Protection. The header's value is a secret: it is copied from KPulse's own rule and never printed.

```bash
KPULSE_CHECK=$(vercel firewall rules inspect "KPulse checks" --project kpulse --scope aikoders 2>&1 | sed -n 's/.*header\[x-kpulse-check\] equals //p' | tr -d '[:space:]') && [ ${#KPULSE_CHECK} -ge 32 ] && vercel firewall rules add "KPulse checks" --project ipac-ecommerce --scope aikoders --description "Lets KPulse uptime checks past Bot Protection (header x-kpulse-check)" --condition "{\"type\":\"header\",\"key\":\"x-kpulse-check\",\"op\":\"eq\",\"value\":\"$KPULSE_CHECK\"}" --action bypass --yes; unset KPULSE_CHECK
```

### Public files

Files that crawlers, link previews and feed readers fetch without a browser: Open Graph cards, catalog images, the sitemap, `robots.txt`, `llms.txt`, the web manifest, the icons and the health check. None of them is sensitive.

```bash
vercel firewall rules add "Public files" --project ipac-ecommerce --scope aikoders --description "Open Graph cards, images, sitemap, robots, llms.txt, manifest, icons and the health check answer every client" --condition '{"type":"path","op":"pre","value":"/og/"}' --or --condition '{"type":"path","op":"pre","value":"/media/"}' --or --condition '{"type":"path","op":"eq","value":"/sitemap.xml"}' --or --condition '{"type":"path","op":"eq","value":"/robots.txt"}' --or --condition '{"type":"path","op":"eq","value":"/llms.txt"}' --or --condition '{"type":"path","op":"eq","value":"/manifest.webmanifest"}' --or --condition '{"type":"path","op":"eq","value":"/favicon.ico"}' --or --condition '{"type":"path","op":"eq","value":"/favicon.svg"}' --or --condition '{"type":"path","op":"eq","value":"/api/health"}' --action bypass --yes
```

### Error relay rate limit

`/api/kpulse` takes error reports from the store's own pages (it checks the origin and caps the body) and forwards them with the server's key. A page sends five at most; this stops anyone from using it to flood KPulse.

```bash
vercel firewall rules add "Error relay rate limit" --project ipac-ecommerce --scope aikoders --description "At most 20 error reports a minute per IP on /api/kpulse" --condition '{"type":"path","op":"eq","value":"/api/kpulse"}' --action rate_limit --rate-limit-window 60 --rate-limit-requests 20 --rate-limit-keys ip --rate-limit-action deny --yes
```

## 3. Publish

Review the draft, then make it live:

```bash
vercel firewall diff --project ipac-ecommerce --scope aikoders
```

```bash
vercel firewall publish --project ipac-ecommerce --scope aikoders --yes
```

## 4. Check

```bash
vercel firewall status --project ipac-ecommerce --scope aikoders
```

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://ipac-ecommerce.aikoders.us/api/health
```

The health check answers `200`, not `429`. In KPulse the monitors of `ipac / storefront` stay up.

## When the store talks to Kart

The browser calls Kart directly, so nothing changes here. If a server-side route is added later (a webhook, a cron), give it a rule like the ones above and add it to this file with the code.
