# NyxID authentication for release-bound research

## Purpose

The Mathematical Atlas is public. NyxID authentication is required only when a reader opens the release-bound CMA research surface.

The browser is an OAuth public client. It uses Authorization Code with PKCE S256 and never contains a client secret. GitHub is not a Pages login provider. A future GitHub-attributed contribution is a separate NyxID-connected service decision.

## Browser flow

```text
public Atlas
  -> open Research
  -> Sign in with NyxID
  -> authorization code + PKCE S256
  -> same-origin callback
  -> verify RS256 ID token with NyxID JWKS
  -> expose one short-lived bearer provider to the CMA client
```

The implementation loads `/.well-known/openid-configuration`, verifies that the issuer and endpoints remain on the configured NyxID origin, and requires:

- authorization-code response type;
- PKCE S256;
- public-client token authentication method `none`;
- RS256 ID token with a unique matching `kid`;
- exact issuer, audience, nonce, expiry, and optional access-token hash;
- a same-origin callback and return target.

## Token custody

The browser stores only the short-lived access-token session needed to survive the same-tab redirect back from NyxID. It is stored in `sessionStorage`, is scoped to the current tab, and is rejected after the configured expiry leeway.

The stored session does not contain:

- a client secret;
- a refresh token;
- the ID token after verification;
- email or profile claims beyond the display name;
- a GitHub credential;
- a model-provider credential;
- a CMA service credential.

Disconnecting removes the NyxID access-token session and all locally remembered CMA thread IDs, preventing a later user in the same browser from inheriting the previous user's research conversation. It does not attempt to terminate the user's global NyxID single-sign-on session.

## Public runtime configuration

`site/data/nyxid-auth.v1.json` is intentionally disabled until the deployment owner registers the exact Pages callback.

```json
{
  "schema": "pages-nyxid-auth.v1",
  "enabled": false,
  "issuer": "https://nyx-api.chrono-ai.fun",
  "client_id": "",
  "redirect_path": "auth/callback.html",
  "scopes": ["openid", "profile"],
  "discovery_path": "/.well-known/openid-configuration",
  "token_leeway_seconds": 30,
  "transaction_ttl_seconds": 600,
  "storage_namespace": "trureturing.pages.nyxid",
  "token_storage": "session-only-access-token",
  "refresh_tokens": false
}
```

`enabled=true` is invalid unless `client_id` is non-empty.

## Shining handoff

Before activation, the CMA and NyxID deployment owner must provide or verify:

1. A NyxID public OAuth client using `token_endpoint_auth_method=none`.
2. `grant_types=[authorization_code]` and `response_types=[code]`.
3. The exact deployed callback URL. For the current project-page layout this is expected to be:

   ```text
   https://the-omega-institute.github.io/trureturing-pages/auth/callback.html
   ```

   The actual deployed URL must be measured before registration. A custom domain requires its own exact callback.
4. NyxID discovery, token, and JWKS endpoints readable from the Pages origin with the required CORS policy.
5. The resulting public `client_id`.
6. A CMA CORS grant for the same Pages origin.
7. A `trureturing-research` CMA environment profile with a conversation-capable runtime.
8. The pinned `codex-formal-answer` skill and an exact read-only truth-release checkout.

After those values are available, an activation PR changes only:

```json
{
  "enabled": true,
  "client_id": "REGISTERED_PUBLIC_CLIENT_ID"
}
```

and enables the separate `site/data/research-agent.v1.json` CMA configuration with the measured CMA origin and a new profile revision.

## Global providers

After a valid NyxID session exists, the auth client exposes the two callbacks already expected by the Research Console:

```js
window.trureturingResearchCredential();
window.trureturingResearchActor();
```

The credential provider returns the current short-lived access token. The actor provider returns an opaque `nyxid:<sub>` reference. Public UI state events never include the access token.

## MVP boundary

This PR enables authentication plumbing only. It does not enable:

- Intuition writeback;
- Formalize submission;
- GitHub attribution;
- anonymous service publication;
- CMA Trigger;
- repository mutation.

The first production smoke is complete only when a signed-in user selects one Atlas node, starts an AG-UI run against the exact configured truth release, receives a streamed advisory answer, and can disconnect without leaving a reusable credential or another user's thread ID in the page.
