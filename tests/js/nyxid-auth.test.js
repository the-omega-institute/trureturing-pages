"use strict";

const assert = require("node:assert/strict");
const { webcrypto } = require("node:crypto");
const Core = require("../../site/assets/nyxid-auth-core.js");

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    }
  };
}

function deterministicCrypto() {
  let counter = 0;
  return {
    subtle: webcrypto.subtle,
    getRandomValues(array) {
      for (let index = 0; index < array.length; index += 1) {
        array[index] = counter % 251;
        counter += 1;
      }
      return array;
    }
  };
}

async function signedIdToken(privateKey, publicJwk, claims) {
  const header = Core.base64UrlEncode(Buffer.from(JSON.stringify({
    alg: "RS256",
    typ: "JWT",
    kid: publicJwk.kid
  })));
  const payload = Core.base64UrlEncode(Buffer.from(JSON.stringify(claims)));
  const input = new TextEncoder().encode(`${header}.${payload}`);
  const signature = await webcrypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    input
  );
  return `${header}.${payload}.${Core.base64UrlEncode(new Uint8Array(signature))}`;
}

(async () => {
  const rawConfig = {
    schema: "pages-nyxid-auth.v1",
    enabled: false,
    issuer: "https://nyx-api.chrono-ai.fun",
    client_id: "",
    redirect_path: "auth/callback.html",
    scopes: ["openid", "profile"],
    discovery_path: "/.well-known/openid-configuration",
    token_leeway_seconds: 30,
    transaction_ttl_seconds: 600,
    storage_namespace: "trureturing.pages.nyxid",
    token_storage: "session-only-access-token",
    refresh_tokens: false
  };
  const disabled = Core.validateConfig(rawConfig);
  assert.equal(disabled.enabled, false);
  assert.throws(
    () => Core.validateConfig({ ...rawConfig, enabled: true }),
    /requires client_id/
  );
  assert.throws(
    () => Core.validateConfig({ ...rawConfig, refresh_tokens: true }),
    /refresh-token custody/
  );
  assert.throws(
    () => Core.validateConfig({ ...rawConfig, client_secret: "forbidden" }),
    /unknown property client_secret/
  );

  const config = Core.validateConfig({
    ...rawConfig,
    enabled: true,
    client_id: "pages-public-client"
  });
  const discovery = Core.validateDiscovery({
    issuer: config.issuer,
    authorization_endpoint: `${config.issuer}/oauth/authorize`,
    token_endpoint: `${config.issuer}/oauth/token`,
    userinfo_endpoint: `${config.issuer}/oauth/userinfo`,
    jwks_uri: `${config.issuer}/.well-known/jwks.json`,
    response_types_supported: ["code"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"]
  }, config);
  assert.throws(
    () => Core.validateDiscovery({
      issuer: config.issuer,
      authorization_endpoint: "https://attacker.example/oauth/authorize",
      token_endpoint: `${config.issuer}/oauth/token`,
      jwks_uri: `${config.issuer}/.well-known/jwks.json`,
      response_types_supported: ["code"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"]
    }, config),
    /issuer origin/
  );

  const now = Date.UTC(2026, 8, 2, 0, 0, 0);
  const pageUrl = "https://the-omega-institute.github.io/trureturing-pages/dag.html?node=A#research";
  const transaction = await Core.createTransaction(
    config,
    pageUrl,
    now,
    deterministicCrypto()
  );
  assert.equal(
    transaction.redirect_uri,
    "https://the-omega-institute.github.io/trureturing-pages/auth/callback.html"
  );
  assert.equal(transaction.return_to, pageUrl);
  assert.match(transaction.code_verifier, /^[A-Za-z0-9_-]{43,128}$/);
  assert.match(transaction.code_challenge, /^[A-Za-z0-9_-]{43,128}$/);

  const authorize = new URL(Core.buildAuthorizationUrl(discovery, config, transaction));
  assert.equal(authorize.origin, config.issuer);
  assert.equal(authorize.pathname, "/oauth/authorize");
  assert.equal(authorize.searchParams.get("response_type"), "code");
  assert.equal(authorize.searchParams.get("client_id"), config.client_id);
  assert.equal(authorize.searchParams.get("code_challenge_method"), "S256");
  assert.equal(authorize.searchParams.get("state"), transaction.state);
  assert.equal(authorize.searchParams.get("nonce"), transaction.nonce);

  const callback = Core.parseCallback(
    `${transaction.redirect_uri}?code=one-time-code&state=${transaction.state}`
  );
  assert.equal(callback.code, "one-time-code");
  assert.equal(callback.state, transaction.state);
  assert.throws(
    () => Core.parseCallback(`${transaction.redirect_uri}#access_token=forbidden`),
    /forbidden URL components|must never arrive/
  );
  const validatedTransaction = Core.validateTransaction(
    transaction,
    config,
    transaction.redirect_uri,
    now + 1_000
  );
  assert.equal(validatedTransaction.return_to, pageUrl);

  let tokenRequest = null;
  const tokens = await Core.exchangeAuthorizationCode(
    async (url, options) => {
      tokenRequest = { url, options };
      return response({
        access_token: "access-token-value",
        id_token: "temporary-id-token",
        refresh_token: "must-be-discarded",
        token_type: "Bearer",
        expires_in: 900,
        scope: "openid profile"
      });
    },
    discovery,
    config,
    transaction,
    "one-time-code"
  );
  assert.equal(tokenRequest.url, `${config.issuer}/oauth/token`);
  assert.equal(tokenRequest.options.credentials, "omit");
  assert.match(tokenRequest.options.body, /code_verifier=/);
  assert.doesNotMatch(tokenRequest.options.body, /client_secret=/);
  assert.equal(Object.hasOwn(tokens, "refresh_token"), false);

  const keyPair = await webcrypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256"
    },
    true,
    ["sign", "verify"]
  );
  const publicJwk = await webcrypto.subtle.exportKey("jwk", keyPair.publicKey);
  publicJwk.kid = "fixture-key";
  publicJwk.alg = "RS256";
  publicJwk.use = "sig";
  const accessToken = "signed-access-token";
  const accessDigest = await Core.sha256(accessToken, webcrypto);
  const claims = {
    iss: config.issuer,
    aud: config.client_id,
    exp: Math.floor(now / 1000) + 900,
    iat: Math.floor(now / 1000),
    nonce: transaction.nonce,
    sub: "user-123",
    name: "Researcher",
    email: "must-not-be-persisted@example.test",
    at_hash: Core.base64UrlEncode(accessDigest.subarray(0, accessDigest.length / 2))
  };
  const idToken = await signedIdToken(keyPair.privateKey, publicJwk, claims);
  const verifiedClaims = await Core.verifyIdToken({
    id_token: idToken,
    access_token: accessToken,
    transaction,
    config,
    discovery,
    jwks: { keys: [publicJwk] },
    now,
    crypto: webcrypto
  });
  assert.equal(verifiedClaims.sub, "user-123");

  const session = Core.createStoredSession(
    config,
    {
      access_token: accessToken,
      expires_in: 900
    },
    verifiedClaims,
    now
  );
  assert.equal(session.actor_ref, "nyxid:user-123");
  assert.equal(session.display_name, "Researcher");
  assert.equal(Object.hasOwn(session, "id_token"), false);
  assert.equal(Object.hasOwn(session, "refresh_token"), false);
  assert.equal(Object.hasOwn(session, "email"), false);
  assert.equal(Core.validateStoredSession(session, config, now + 1_000).subject, "user-123");
  assert.equal(Core.validateStoredSession(session, config, now + 870_000), null);

  await assert.rejects(
    () => Core.verifyIdToken({
      id_token: idToken,
      access_token: accessToken,
      transaction: { ...transaction, nonce: "x".repeat(43) },
      config,
      discovery,
      jwks: { keys: [publicJwk] },
      now,
      crypto: webcrypto
    }),
    /nonce mismatch/
  );

  const values = new Map([
    ["trureturing:research-session:one", "thread-one"],
    ["unrelated", "keep"]
  ]);
  const storage = {
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] || null; },
    removeItem(key) { values.delete(key); }
  };
  Core.clearResearchThreads(storage);
  assert.equal(values.has("trureturing:research-session:one"), false);
  assert.equal(values.get("unrelated"), "keep");

  const publicState = Core.publicState(session, true, null);
  assert.equal(publicState.authenticated, true);
  assert.equal(Object.hasOwn(publicState, "access_token"), false);

  console.log("nyxid auth tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
