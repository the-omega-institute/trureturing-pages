(function () {
  "use strict";

  const Core = window.TrureturingNyxIdAuthCore;
  const status = document.querySelector("#nyxid-callback-status");
  const detail = document.querySelector("#nyxid-callback-detail");
  const returnLink = document.querySelector("#nyxid-callback-return");
  if (!Core || !status || !detail || !returnLink) return;

  function setStatus(title, message, tone) {
    status.textContent = title;
    detail.textContent = message;
    document.body.dataset.tone = tone;
  }

  async function fetchJson(url, label) {
    const response = await fetch(url, {
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      referrerPolicy: "no-referrer",
      headers: { Accept: "application/json" }
    });
    if (!response.ok) throw new Error(`${label} returned HTTP ${response.status}`);
    return response.json();
  }

  function storage() {
    try {
      return window.sessionStorage;
    } catch (_) {
      return null;
    }
  }

  function localStorageOrNull() {
    try {
      return window.localStorage;
    } catch (_) {
      return null;
    }
  }

  async function complete() {
    const sessionStorage = storage();
    if (!sessionStorage) {
      throw new Error("This browser blocks the session storage required to complete PKCE login.");
    }
    const rawConfig = await fetchJson("../data/nyxid-auth.v1.json", "NyxID configuration");
    const config = Core.validateConfig(rawConfig);
    if (!config.enabled) throw new Error("NyxID research authentication is not activated.");

    const discoveryUrl = new URL(config.discovery_path, `${config.issuer}/`).toString();
    const discovery = Core.validateDiscovery(
      await fetchJson(discoveryUrl, "NyxID OIDC discovery"),
      config
    );

    const transactionKey = Core.storageKey(config, "transaction");
    let storedTransaction;
    try {
      storedTransaction = JSON.parse(sessionStorage.getItem(transactionKey) || "null");
    } catch (_) {
      storedTransaction = null;
    }
    const transaction = Core.validateTransaction(
      storedTransaction,
      config,
      window.location.href,
      Date.now()
    );
    const callback = Core.parseCallback(window.location.href);
    if (callback.error) {
      throw new Error(callback.error_description || callback.error);
    }
    if (!callback.code || !callback.state) {
      throw new Error("NyxID callback is missing the authorization code or state.");
    }
    if (!Core.constantTimeEqual(callback.state, transaction.state)) {
      throw new Error("NyxID callback state does not match the login transaction.");
    }

    setStatus("Verifying NyxID", "Exchanging the one-time code and verifying the signed identity token.", "working");
    const tokens = await Core.exchangeAuthorizationCode(
      window.fetch.bind(window),
      discovery,
      config,
      transaction,
      callback.code
    );
    const jwks = await fetchJson(discovery.jwks_uri, "NyxID JWKS");
    const claims = await Core.verifyIdToken({
      id_token: tokens.id_token,
      access_token: tokens.access_token,
      transaction,
      config,
      discovery,
      jwks,
      now: Date.now(),
      crypto: window.crypto
    });
    const session = Core.createStoredSession(config, tokens, claims, Date.now());

    sessionStorage.setItem(
      Core.storageKey(config, "session"),
      JSON.stringify(session)
    );
    sessionStorage.removeItem(transactionKey);
    Core.clearResearchThreads(localStorageOrNull());

    window.history.replaceState(null, "", new URL(window.location.pathname, window.location.origin).toString());
    setStatus("NyxID connected", `Returning to TrueTurning as ${session.display_name}.`, "ready");
    window.location.replace(transaction.return_to);
  }

  complete().catch((error) => {
    setStatus("NyxID login could not be completed", error.message, "error");
    returnLink.hidden = false;
  });
}());
