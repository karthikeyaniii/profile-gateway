# Profile Gateway

Profile Gateway is a hosted HTTP API that accepts a LinkedIn profile URL and returns the profile as
structured JSON. It extracts name, headline, location, about, experience, education, skills,
certifications, languages, and profile images when those fields are visible to the authenticated
LinkedIn account.

It uses authenticated LinkedIn web requests, server-rendered profile sections, and SDUI skill
overlays. It does not require a paid scraping provider or a browser in the API request path.

## Features

- `POST /v1/profiles` profile extraction
- `GET /health` deployment health check
- Strict LinkedIn profile URL validation and canonicalisation
- Automatic self-profile resolution when the request body is `{}`
- All rendered experience cards and education entries
- Skills from every experience overlay, merged and deduplicated
- Stable response schema with empty arrays for unavailable collections
- Production API-key authentication
- Conservative pacing, request budgets, cooldowns, and zero automatic retries
- Docker and Render deployment configuration
- Optional, separately gated Voyager posting CLI

## Requirements

- [Bun](https://bun.sh/) 1.1 or newer
- A LinkedIn account and authenticated browser session
- Chrome or Microsoft Edge with remote debugging enabled for initial session capture

## Local setup

```powershell
bun install
Copy-Item .env.example .env
```

Start Edge with an isolated debugging profile:

```powershell
$profileDir = "$env:LOCALAPPDATA\ProfileGateway\Chrome"
Start-Process "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" `
  -ArgumentList @(
    "--remote-debugging-port=9222",
    "--user-data-dir=$profileDir",
    "https://www.linkedin.com/feed/"
  )
```

Log into LinkedIn in that window, visit the feed, and capture the session locally:

```powershell
bun run dev -- login
bun run dev -- whoami
```

Copy the captured values into `.env`. Never commit `.env`, cookies, captures, or API keys. Generate
a strong API key, then start the server:

```powershell
$bytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
[Convert]::ToHexString($bytes).ToLowerInvariant()

bun run dev:api
Invoke-RestMethod "http://127.0.0.1:3000/health"
```

## API documentation

### Health check

```http
GET /health
```

```json
{ "status": "ok" }
```

### Extract a profile

```http
POST /v1/profiles
Authorization: Bearer <API_KEY>
Content-Type: application/json
```

```json
{
  "url": "https://www.linkedin.com/in/example-profile/"
}
```

An empty object resolves the account associated with the backend LinkedIn session:

```json
{}
```

PowerShell example:

```powershell
$headers = @{
  Authorization = "Bearer YOUR_API_KEY"
  "Content-Type" = "application/json"
}
$body = @{ url = "https://www.linkedin.com/in/example-profile/" } | ConvertTo-Json

$response = Invoke-RestMethod `
  -Method Post `
  -Uri "http://127.0.0.1:3000/v1/profiles" `
  -Headers $headers `
  -Body $body

$response | ConvertTo-Json -Depth 20
```

Example response:

```json
{
  "data": {
    "profileUrl": "https://www.linkedin.com/in/example-profile/",
    "publicIdentifier": "example-profile",
    "name": "Alex Example",
    "headline": "Platform Engineer",
    "location": "Example City, Example Region",
    "about": "Profile summary when available",
    "experience": [
      {
        "title": "Software Engineer",
        "company": "Example Labs",
        "location": "Example City",
        "startDate": { "month": 1, "year": 2024 }
      }
    ],
    "education": [
      {
        "school": "Example University",
        "degree": "BTech",
        "fieldOfStudy": "Computer Science"
      }
    ],
    "skills": [
      { "name": "TypeScript" },
      { "name": "Distributed Systems" }
    ],
    "certifications": [
      { "name": "Example Certification", "issuer": "Example Institute" }
    ],
    "languages": [
      { "name": "English", "proficiency": "NATIVE_OR_BILINGUAL" }
    ],
    "images": {
      "profile": "https://media.licdn.com/example-profile-image"
    }
  }
}
```

Optional scalar properties are omitted when unavailable. Collection properties are always arrays,
and `images` is always an object.

### Errors

```json
{
  "error": {
    "code": "INVALID_INPUT",
    "message": "url must be an HTTPS LinkedIn profile URL"
  }
}
```

| Status | Meaning |
|---|---|
| `400` | Invalid JSON or profile URL |
| `401` | Missing or incorrect API key |
| `404` | Profile not found |
| `429` | Request budget exhausted or cooldown active |
| `502` | LinkedIn authentication, challenge, or upstream failure |

## Approach

The response combines several authenticated sources:

1. A decorated profile summary supplies headline, location, current position, and education
   references.
2. The server-rendered experience page supplies all visible experience cards.
3. Every experience skill-association overlay supplies its associated skill list; names are merged
   and deduplicated.
4. The rendered profile header supplies the display name and profile image.
5. Remaining certification and language collections supply those optional sections.

Every upstream call uses one classified client. It checks a persistent cooldown and request budget,
adds a conservative delay, performs exactly one request, and never retries automatically. API
requests are serialised so concurrent traffic cannot bypass pacing.

## Configuration

| Variable | Required | Purpose |
|---|---:|---|
| `LINKEDIN_LI_AT` | Yes | Authenticated LinkedIn session cookie |
| `LINKEDIN_JSESSIONID` | Yes | LinkedIn CSRF/session value |
| `LINKEDIN_USER_AGENT` | Yes | User agent from the browser that created the session |
| `API_KEY` | Production | Bearer token protecting the API |
| `LINKEDIN_SESSION_CAPTURED_AT` | No | Session-age diagnostic timestamp |
| `PORT` | No | HTTP port; defaults to `3000` |
| `CORS_ORIGIN` | No | Allowed browser origin |
| `PROFILE_GATEWAY_CACHE_DIR` | No | Budget, cooldown, and session directory |

## Testing

```powershell
bun run typecheck
bun run lint
bun test tests/api.test.ts tests/profile.test.ts tests/profile-html.test.ts
bun run build
```

Parser and API tests use synthetic fixtures and never contact LinkedIn. Live verification must use
the operator's own account and should be performed conservatively.

## Deployment on Render

1. Push this repository to GitHub.
2. Create a Render Blueprint and select the repository.
3. Render reads `render.yaml` and builds the included `Dockerfile`.
4. Add `LINKEDIN_LI_AT`, `LINKEDIN_JSESSIONID`, `LINKEDIN_USER_AGENT`, and
   `LINKEDIN_SESSION_CAPTURED_AT` as secret environment variables.
5. Render generates `API_KEY`; copy it for API clients.
6. Verify `https://<service-host>/health`, then call `POST /v1/profiles` over HTTPS.

Never put production credentials in `render.yaml`, Docker layers, source files, GitHub Actions, or
commits.

## Optional Voyager posting

Voyager posting is an additional CLI feature and is not exposed through the HTTP API. It requires
an interactive confirmation:

```powershell
bun run dev -- share "Your post text" --via voyager
```

The command shows the exact text, visibility, transport, and confirmation token before sending. Its
automated tests mock the network and never publish a real post.

## Known limitations and risk

- LinkedIn does not provide a sanctioned individual-developer API for arbitrary profile reads. This
  implementation uses private web endpoints and may violate LinkedIn's User Agreement; the account
  can be challenged, restricted, or banned.
- LinkedIn can change query IDs, HTML, SDUI payloads, and response shapes without notice.
- Sessions expire and may require a fresh browser login.
- Privacy settings determine which fields the backend account can access.
- Skills are collected from rendered experience associations. Unrendered or unassociated skills may
  not be returned.
- LinkedIn may legitimately return no languages, certifications, background image, or about section.
- A complete extraction intentionally takes time because every upstream call is paced.
- The service is single-account by design and is not intended for bulk harvesting.

## Security

- `.env`, cookies, HAR files, and captures are excluded by `.gitignore`.
- Production refuses to start without `API_KEY`.
- Responses never include cookies, CSRF values, raw LinkedIn payloads, or internal hints.
- Redirects are classified instead of silently following login or checkpoint pages.

## License and attribution

This project adapts and extends Tamás Gábor's MIT-licensed
[`linkedin-relay`](https://github.com/gabros20/linkedin-relay). The original copyright and permission
notice remain in [`LICENSE`](LICENSE). The hosted profile API, profile aggregation, skill-overlay
extraction, deployment configuration, and associated tests are additions made for this implementation.
