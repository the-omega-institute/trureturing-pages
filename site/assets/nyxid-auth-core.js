(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root && typeof root === "object") root.TrureturingNyxIdAuthCore = api;
}(typeof globalThis === "object" ? globalThis : this, function () {
  "use strict";

  const CONFIG_SCHEMA = "pages-nyxid-auth.v1";
  const TRANSACTION_SCHEMA = "pages-nyxid-transaction.v1";
  const SESSION_SCHEMA = "pages-nyxid-session.v1";
  const AUTH_EVENT = "trureturing:nyxid-auth-changed";
  const RESEARCH_THREAD_PREFIX = "trureturing:research-session:";
  const CALLBACK_FIELDS = ["code", "state", "error", "error_description", "error_uri", "iss"];

  function isObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function object(value, name) {
    if (!isObject(value)) throw new TypeError(`${name} must be an object`);
    return value;
  }

  function string(value, name, maximum) {
    if (typeof value !== "string" || value.trim() === "") {
      throw new TypeError(`${name} must be a non-empty string`);
    }
    if (maximum && value.length > maximum) throw new TypeError(`${name} is too long`);
    return value;
  }

  function integer(value, name, minimum, maximum) {
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
      throw new TypeError(`${name} must be an integer from ${minimum} through ${maximum}`);
    }
    return value;
  }

  function closed(value, fields, name) {
    for (const key of Object.keys(value)) {
      if (!fields.includes(key)) throw new TypeError(`${name} contains unknown property ${key}`);
    }
  }

  function loopback(hostname) {
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
  }

  function secureUrl(value, name, allowQuery) {
    const url = new URL(string(value, name, 2048));
    if (url.username || url.password || url.hash || (!allowQuery && url.search)) {
      throw new TypeError(`${name} contains forbidden URL components`);
    }
    if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback(url.hostname))) {
      throw new TypeError(`${name} must use HTTPS outside loopback development`);
    }
    return url;
  }

  function issuer(value) {
    const url = secureUrl(value, "issuer", false);
    if (url.pathname !== "/" && url.pathname !== "") {
      throw new TypeError("issuer must not contain a path");
    }
    return url.origin;
  }

  function validateConfig(value) {
    object(value, "NyxID configuration");
    closed(value, [
      "schema", "enabled", "issuer", "client_id", "redirect_path", "scopes",
      "discovery_path", "token_leeway_seconds", "transaction_ttl_seconds",
      "storage_namespace", "token_storage", "refresh_tokens"
    ], "NyxID configuration");
    if (value.schema !== CONFIG_SCHEMA) throw new TypeError("unsupported NyxID configuration schema");
    if (typeof value.enabled !== "boolean") throw new TypeError("enabled must be boolean");
    if (typeof value.client_id !== "string" || value.client_id.length > 256) {
      throw new TypeError("client_id must be a string of at most 256 characters");
    }
    if (value.enabled && value.client_id.trim() === "") {
      throw new TypeError("enabled NyxID configuration requires client_id");
    }
    const redirectPath = string(value.redirect_path, "redirect_path", 256);
    if (redirectPath.startsWith("/") || redirectPath.includes("..") ||
        redirectPath.includes("\\") || redirectPath.includes("?") ||
        redirectPath.includes("#") || !redirectPath.endsWith(".html")) {
      throw new TypeError("redirect_path must be a same-site relative HTML path");
    }
    if (!Array.isArray(value.scopes) || value.scopes.length < 1 || value.scopes.length > 5) {
      throw new TypeError("scopes must be a bounded array");
    }
    const scopes = value.scopes.map((scope, index) => string(scope, `scopes[${index}]`, 64));
    if (new Set(scopes).size !== scopes.length || !scopes.includes("openid")) {
      throw new TypeError("scopes must be unique and include openid");
    }
    const allowedScopes = new Set(["openid", "profile", "email", "roles", "groups"]);
    if (scopes.some((scope) => !allowedScopes.has(scope))) {
      throw new TypeError("scopes contains an unsupported NyxID scope");
    }
    if (value.discovery_path !== "/.well-known/openid-configuration") {
      throw new TypeError("discovery_path must use the OIDC discovery endpoint");
    }
    if (value.token_storage !== "session-only-access-token") {
      throw new TypeError("token_storage must be session-only-access-token");
    }
    if (value.refresh_tokens !== false) {
      throw new TypeError("browser refresh-token custody must remain disabled");
    }
    return Object.freeze({
      schema: CONFIG_SCHEMA,
      enabled: value.enabled,
      issuer: issuer(value.issuer),
      client_id: value.client_id.trim(),
      redirect_path: redirectPath,
      scopes: Object.freeze([...scopes]),
      discovery_path: value.discovery_path,
      token_leeway_seconds: integer(value.token_leeway_seconds, "token_leeway_seconds", 0, 120),
      transaction_ttl_seconds: integer(value.transaction_ttl_seconds, "transaction_ttl_seconds", 60, 900),
      storage_namespace: string(value.storage_namespace, "storage_namespace", 128),
      token_storage: value.token_storage,
      refresh_tokens: false
    });
  }

  function endpoint(value, configuredIssuer, name) {
    const url = secureUrl(value, name, false);
    if (url.origin !== new URL(configuredIssuer).origin) {
      throw new TypeError(`${name} must use the configured issuer origin`);
    }
    return url.toString();
  }

  function validateDiscovery(value, config) {
    object(value, "OIDC discovery metadata");
    if (value.issuer !== config.issuer) throw new TypeError("OIDC discovery issuer mismatch");
    if (!Array.isArray(value.response_types_supported) || !value.response_types_supported.includes("code")) {
      throw new TypeError("OIDC discovery does not support authorization code flow");
    }
    if (!Array.isArray(value.code_challenge_methods_supported) ||
        !value.code_challenge_methods_supported.includes("S256")) {
      throw new TypeError("OIDC discovery does not support PKCE S256");
    }
    if (!Array.isArray(value.token_endpoint_auth_methods_supported) ||
        !value.token_endpoint_auth_methods_supported.includes("none")) {
      throw new TypeError("OIDC discovery does not support public clients");
    }
    return Object.freeze({
      issuer: config.issuer,
      authorization_endpoint: endpoint(value.authorization_endpoint, config.issuer, "authorization_endpoint"),
      token_endpoint: endpoint(value.token_endpoint, config.issuer, "token_endpoint"),
      userinfo_endpoint: value.userinfo_endpoint
        ? endpoint(value.userinfo_endpoint, config.issuer, "userinfo_endpoint")
        : null,
      jwks_uri: endpoint(value.jwks_uri, config.issuer, "jwks_uri")
    });
  }

  function base64UrlEncode(value) {
    const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
    let base64;
    if (typeof Buffer === "function") {
      base64 = Buffer.from(bytes).toString("base64");
    } else {
      let binary = "";
      for (let offset = 0; offset < bytes.length; offset += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
      }
      base64 = btoa(binary);
    }
    return base64.replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
  }

  function base64UrlDecode(value) {
    if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) {
      throw new TypeError("base64url value is malformed");
    }
    const padded = value.replaceAll("-", "+").replaceAll("_", "/") +
      "=".repeat((4 - value.length % 4) % 4);
    if (typeof Buffer === "function") return new Uint8Array(Buffer.from(padded, "base64"));
    const binary = atob(padded);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  }

  function bytes(value) {
    return new TextEncoder().encode(String(value));
  }

  async function sha256(value, cryptoApi) {
    const source = cryptoApi || globalThis.crypto;
    if (!source || !source.subtle) throw new Error("WebCrypto is required for NyxID authentication");
    const input = value instanceof Uint8Array ? value : bytes(value);
    return new Uint8Array(await source.subtle.digest("SHA-256", input));
  }

  function randomValue(length, cryptoApi) {
    const source = cryptoApi || globalThis.crypto;
    if (!source || typeof source.getRandomValues !== "function") {
      throw new Error("secure randomness is required for NyxID authentication");
    }
    const value = new Uint8Array(length);
    source.getRandomValues(value);
    return base64UrlEncode(value);
  }

  function constantTimeEqual(left, right) {
    if (typeof left !== "string" || typeof right !== "string") return false;
    const size = Math.max(left.length, right.length);
    let mismatch = left.length ^ right.length;
    for (let index = 0; index < size; index += 1) {
      mismatch |= (left.charCodeAt(index % Math.max(1, left.length)) || 0) ^
        (right.charCodeAt(index % Math.max(1, right.length)) || 0);
    }
    return mismatch === 0;
  }

  function sameOriginReturnTo(value, pageUrl) {
    const page = new URL(pageUrl);
    const target = new URL(value || pageUrl, page);
    if (target.origin !== page.origin || target.username || target.password) {
      throw new TypeError("return_to must remain on the current Pages origin");
    }
    for (const name of CALLBACK_FIELDS) target.searchParams.delete(name);
    return target.toString();
  }

  function redirectUri(config, pageUrl) {
    const page = new URL(pageUrl);
    const target = new URL(config.redirect_path, page);
    if (target.origin !== page.origin) throw new TypeError("redirect path crossed the Pages origin");
    return target.toString();
  }

  async function createTransaction(config, pageUrl, nowMilliseconds, cryptoApi) {
    const now = Number.isFinite(nowMilliseconds) ? nowMilliseconds : Date.now();
    const codeVerifier = randomValue(32, cryptoApi);
    const codeChallenge = base64UrlEncode(await sha256(codeVerifier, cryptoApi));
    return Object.freeze({
      schema: TRANSACTION_SCHEMA,
      issuer: config.issuer,
      client_id: config.client_id,
      redirect_uri: redirectUri(config, pageUrl),
      return_to: sameOriginReturnTo(pageUrl, pageUrl),
      state: randomValue(32, cryptoApi),
      nonce: randomValue(32, cryptoApi),
      code_verifier: codeVerifier,
      code_challenge: codeChallenge,
      created_at: now,
      expires_at: now + config.transaction_ttl_seconds * 1000
    });
  }

  function buildAuthorizationUrl(discovery, config, transaction) {
    const url = new URL(discovery.authorization_endpoint);
    url.search = new URLSearchParams({
      response_type: "code",
      client_id: config.client_id,
      redirect_uri: transaction.redirect_uri,
      scope: config.scopes.join(" "),
      code_challenge: transaction.code_challenge,
      code_challenge_method: "S256",
      state: transaction.state,
      nonce: transaction.nonce
    }).toString();
    return url.toString();
  }

  function parseCallback(value) {
    const url = secureUrl(value, "callback URL", true);
    if (url.hash) throw new TypeError("OAuth tokens must never arrive in a URL fragment");
    return Object.freeze({
      code: url.searchParams.get("code"),
      state: url.searchParams.get("state"),
      error: url.searchParams.get("error"),
      error_description: url.searchParams.get("error_description")
    });
  }

  function validateTransaction(value, config, callbackUrl, nowMilliseconds) {
    object(value, "NyxID transaction");
    closed(value, [
      "schema", "issuer", "client_id", "redirect_uri", "return_to", "state", "nonce",
      "code_verifier", "code_challenge", "created_at", "expires_at"
    ], "NyxID transaction");
    if (value.schema !== TRANSACTION_SCHEMA || value.issuer !== config.issuer ||
        value.client_id !== config.client_id) throw new TypeError("NyxID transaction binding mismatch");
    const callback = secureUrl(callbackUrl, "callback URL", true);
    const expected = secureUrl(value.redirect_uri, "transaction redirect_uri", false);
    if (callback.origin !== expected.origin || callback.pathname !== expected.pathname) {
      throw new TypeError("NyxID callback does not match the transaction redirect URI");
    }
    const now = Number.isFinite(nowMilliseconds) ? nowMilliseconds : Date.now();
    if (!Number.isSafeInteger(value.created_at) || !Number.isSafeInteger(value.expires_at) ||
        value.created_at > now + 60_000 || value.expires_at <= now ||
        value.expires_at - value.created_at > config.transaction_ttl_seconds * 1000) {
      throw new TypeError("NyxID transaction is expired or has invalid timing");
    }
    string(value.state, "transaction state", 256);
    string(value.nonce, "transaction nonce", 256);
    string(value.code_verifier, "code_verifier", 256);
    string(value.code_challenge, "code_challenge", 256);
    return Object.freeze({ ...value, return_to: sameOriginReturnTo(value.return_to, callbackUrl) });
  }

  async function exchangeAuthorizationCode(fetchFunction, discovery, config, transaction, code) {
    if (typeof fetchFunction !== "function") throw new TypeError("fetchFunction is required");
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code: string(code, "authorization code", 4096),
      redirect_uri: transaction.redirect_uri,
      client_id: config.client_id,
      code_verifier: transaction.code_verifier
    });
    const response = await fetchFunction(discovery.token_endpoint, {
      method: "POST",
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
      redirect: "error",
      referrerPolicy: "no-referrer",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: body.toString()
    });
    if (!response || !response.ok) {
      let detail = response ? `HTTP ${response.status}` : "no response";
      try {
        const problem = await response.json();
        detail = problem.error_description || problem.detail || problem.error || detail;
      } catch (_) {
        // Token response bodies are deliberately not reflected.
      }
      throw new Error(`NyxID token exchange failed: ${detail}`);
    }
    const value = object(await response.json(), "NyxID token response");
    if (value.token_type !== "Bearer") throw new TypeError("NyxID token type must be Bearer");
    return Object.freeze({
      access_token: string(value.access_token, "access_token", 32768),
      id_token: string(value.id_token, "id_token", 32768),
      token_type: "Bearer",
      expires_in: integer(value.expires_in, "expires_in", 1, 86400),
      scope: typeof value.scope === "string" ? value.scope : config.scopes.join(" ")
    });
  }

  function jwtPart(value, name) {
    try {
      return object(JSON.parse(new TextDecoder().decode(base64UrlDecode(value))), name);
    } catch (error) {
      throw new TypeError(`${name} is malformed: ${error.message}`);
    }
  }

  function parseJwt(value) {
    const parts = string(value, "JWT", 32768).split(".");
    if (parts.length !== 3 || parts.some((part) => part === "")) {
      throw new TypeError("JWT must contain three non-empty segments");
    }
    return Object.freeze({
      headerEncoded: parts[0],
      payloadEncoded: parts[1],
      signatureEncoded: parts[2],
      header: jwtPart(parts[0], "JWT header"),
      claims: jwtPart(parts[1], "JWT claims")
    });
  }

  function audienceMatches(audience, clientId) {
    return typeof audience === "string"
      ? audience === clientId
      : Array.isArray(audience) && audience.includes(clientId);
  }

  async function verifyIdToken(options) {
    object(options, "ID-token verification options");
    const cryptoApi = options.crypto || globalThis.crypto;
    if (!cryptoApi || !cryptoApi.subtle) throw new Error("WebCrypto is required to verify ID tokens");
    const parsed = parseJwt(options.id_token);
    if (parsed.header.alg !== "RS256" || typeof parsed.header.kid !== "string") {
      throw new TypeError("ID token must use RS256 with a key id");
    }
    const jwks = object(options.jwks, "JWKS");
    if (!Array.isArray(jwks.keys)) throw new TypeError("JWKS keys must be an array");
    const matches = jwks.keys.filter((key) => isObject(key) && key.kid === parsed.header.kid &&
      key.kty === "RSA" && (!key.alg || key.alg === "RS256") && (!key.use || key.use === "sig"));
    if (matches.length !== 1) throw new TypeError("ID token key is missing or ambiguous in JWKS");
    const key = await cryptoApi.subtle.importKey(
      "jwk", matches[0], { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]
    );
    const valid = await cryptoApi.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      base64UrlDecode(parsed.signatureEncoded),
      bytes(`${parsed.headerEncoded}.${parsed.payloadEncoded}`)
    );
    if (!valid) throw new TypeError("ID token signature verification failed");

    const claims = parsed.claims;
    const now = Math.floor((Number.isFinite(options.now) ? options.now : Date.now()) / 1000);
    const leeway = options.config.token_leeway_seconds;
    if (claims.iss !== options.discovery.issuer) throw new TypeError("ID token issuer mismatch");
    if (!audienceMatches(claims.aud, options.config.client_id)) throw new TypeError("ID token audience mismatch");
    if (Array.isArray(claims.aud) && claims.aud.length > 1 && claims.azp !== options.config.client_id) {
      throw new TypeError("ID token authorized party mismatch");
    }
    if (!Number.isSafeInteger(claims.exp) || claims.exp <= now + leeway) {
      throw new TypeError("ID token is expired or too close to expiry");
    }
    if (claims.iat != null && (!Number.isSafeInteger(claims.iat) || claims.iat > now + leeway)) {
      throw new TypeError("ID token issued-at time is invalid");
    }
    if (claims.nbf != null && (!Number.isSafeInteger(claims.nbf) || claims.nbf > now + leeway)) {
      throw new TypeError("ID token is not yet valid");
    }
    if (!constantTimeEqual(claims.nonce, options.transaction.nonce)) {
      throw new TypeError("ID token nonce mismatch");
    }
    string(claims.sub, "ID token subject", 512);
    if (claims.at_hash != null) {
      const digest = await sha256(options.access_token, cryptoApi);
      const expected = base64UrlEncode(digest.subarray(0, digest.length / 2));
      if (!constantTimeEqual(claims.at_hash, expected)) {
        throw new TypeError("ID token access-token hash mismatch");
      }
    }
    return Object.freeze({ ...claims });
  }

  function createStoredSession(config, tokens, claims, nowMilliseconds) {
    const now = Number.isFinite(nowMilliseconds) ? nowMilliseconds : Date.now();
    const displayName = typeof claims.name === "string" && claims.name.trim()
      ? claims.name.trim().slice(0, 160)
      : "NyxID user";
    return Object.freeze({
      schema: SESSION_SCHEMA,
      issuer: config.issuer,
      client_id: config.client_id,
      access_token: tokens.access_token,
      expires_at: Math.min(now + tokens.expires_in * 1000, claims.exp * 1000),
      subject: claims.sub,
      actor_ref: `nyxid:${claims.sub}`,
      display_name: displayName,
      signed_in_at: now
    });
  }

  function validateStoredSession(value, config, nowMilliseconds) {
    if (!isObject(value)) return null;
    try {
      closed(value, [
        "schema", "issuer", "client_id", "access_token", "expires_at", "subject",
        "actor_ref", "display_name", "signed_in_at"
      ], "NyxID session");
      if (value.schema !== SESSION_SCHEMA || value.issuer !== config.issuer ||
          value.client_id !== config.client_id) return null;
      string(value.access_token, "session access_token", 32768);
      string(value.subject, "session subject", 512);
      if (value.actor_ref !== `nyxid:${value.subject}`) return null;
      string(value.display_name, "session display_name", 160);
      const now = Number.isFinite(nowMilliseconds) ? nowMilliseconds : Date.now();
      if (!Number.isSafeInteger(value.expires_at) ||
          value.expires_at <= now + config.token_leeway_seconds * 1000) return null;
      if (!Number.isSafeInteger(value.signed_in_at) || value.signed_in_at > now + 60000) return null;
      return Object.freeze({ ...value });
    } catch (_) {
      return null;
    }
  }

  function storageKey(config, kind) {
    if (kind !== "transaction" && kind !== "session") throw new TypeError("unknown storage kind");
    return `${config.storage_namespace}.${kind}`;
  }

  function clearResearchThreads(storage) {
    if (!storage || typeof storage.length !== "number" || typeof storage.key !== "function") return;
    const keys = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (typeof key === "string" && key.startsWith(RESEARCH_THREAD_PREFIX)) keys.push(key);
    }
    for (const key of keys) storage.removeItem(key);
  }

  function publicState(session, configured, error) {
    return Object.freeze({
      configured: Boolean(configured),
      authenticated: Boolean(session),
      actor_ref: session ? session.actor_ref : null,
      display_name: session ? session.display_name : null,
      expires_at: session ? session.expires_at : null,
      error: error ? String(error) : null
    });
  }

  return Object.freeze({
    AUTH_EVENT,
    CONFIG_SCHEMA,
    RESEARCH_THREAD_PREFIX,
    SESSION_SCHEMA,
    TRANSACTION_SCHEMA,
    base64UrlDecode,
    base64UrlEncode,
    buildAuthorizationUrl,
    clearResearchThreads,
    constantTimeEqual,
    createStoredSession,
    createTransaction,
    exchangeAuthorizationCode,
    parseCallback,
    parseJwt,
    publicState,
    redirectUri,
    sameOriginReturnTo,
    sha256,
    storageKey,
    validateConfig,
    validateDiscovery,
    validateStoredSession,
    validateTransaction,
    verifyIdToken
  });
}));
