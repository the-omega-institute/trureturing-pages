(function () {
  "use strict";

  const Core = window.TrureturingNyxIdAuthCore;
  const control = document.querySelector("#nyxid-auth-control");
  const status = document.querySelector("#nyxid-auth-status");
  const user = document.querySelector("#nyxid-auth-user");
  const signInButton = document.querySelector("#nyxid-auth-sign-in");
  const disconnectButton = document.querySelector("#nyxid-auth-disconnect");
  const authGate = document.querySelector("#research-auth-gate");
  const researchConsole = document.querySelector("#research-console");

  if (!Core || !control || !status || !user || !signInButton || !disconnectButton) {
    return;
  }

  const state = {
    config: null,
    discovery: null,
    session: null,
    error: null,
    ready: false
  };

  function sessionStorageOrNull() {
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

  function dispatchState() {
    const detail = Core.publicState(
      state.session,
      Boolean(state.config && state.config.enabled),
      state.error
    );
    window.dispatchEvent(new CustomEvent(Core.AUTH_EVENT, { detail }));
  }

  function render() {
    const configured = Boolean(state.config && state.config.enabled && state.discovery);
    const authenticated = Boolean(state.session);
    control.dataset.state = state.error
      ? "error"
      : authenticated
        ? "authenticated"
        : configured
          ? "signed-out"
          : state.ready
            ? "disabled"
            : "loading";

    if (authGate) authGate.disabled = !authenticated;
    signInButton.hidden = authenticated;
    disconnectButton.hidden = !authenticated;
    signInButton.disabled = !configured;
    user.hidden = !authenticated;

    if (state.error) {
      status.textContent = state.error;
      user.textContent = "";
    } else if (authenticated) {
      status.textContent = "NyxID research session";
      user.textContent = state.session.display_name;
    } else if (configured) {
      status.textContent = "Sign in to ask the research agent";
      user.textContent = "";
    } else if (state.ready) {
      status.textContent = "NyxID activation is waiting for the registered Pages client ID";
      user.textContent = "";
    } else {
      status.textContent = "Loading NyxID identity configuration";
      user.textContent = "";
    }
    dispatchState();
  }

  function clearSession() {
    const storage = sessionStorageOrNull();
    if (storage && state.config) {
      storage.removeItem(Core.storageKey(state.config, "session"));
      storage.removeItem(Core.storageKey(state.config, "transaction"));
    }
    Core.clearResearchThreads(localStorageOrNull());
    state.session = null;
  }

  function loadSession() {
    const storage = sessionStorageOrNull();
    if (!storage || !state.config) return null;
    const key = Core.storageKey(state.config, "session");
    let parsed = null;
    try {
      const raw = storage.getItem(key);
      parsed = raw ? JSON.parse(raw) : null;
    } catch (_) {
      parsed = null;
    }
    const value = Core.validateStoredSession(parsed, state.config, Date.now());
    if (!value && parsed) storage.removeItem(key);
    return value;
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

  async function initialize() {
    try {
      const rawConfig = await fetchJson("data/nyxid-auth.v1.json", "NyxID configuration");
      state.config = Core.validateConfig(rawConfig);
      if (state.config.enabled) {
        const discoveryUrl = new URL(
          state.config.discovery_path,
          `${state.config.issuer}/`
        ).toString();
        state.discovery = Core.validateDiscovery(
          await fetchJson(discoveryUrl, "NyxID OIDC discovery"),
          state.config
        );
        state.session = loadSession();
      }
    } catch (error) {
      state.error = error.message;
      clearSession();
    } finally {
      state.ready = true;
      render();
    }
  }

  async function signIn() {
    await readyPromise;
    if (!state.config || !state.config.enabled || !state.discovery) {
      throw new Error("NyxID research authentication is not activated for this deployment.");
    }
    const storage = sessionStorageOrNull();
    if (!storage) {
      throw new Error("This browser blocks the session storage required for the PKCE redirect.");
    }
    const transaction = await Core.createTransaction(
      state.config,
      window.location.href,
      Date.now(),
      window.crypto
    );
    storage.setItem(
      Core.storageKey(state.config, "transaction"),
      JSON.stringify(transaction)
    );
    state.error = null;
    window.location.assign(
      Core.buildAuthorizationUrl(state.discovery, state.config, transaction)
    );
  }

  async function disconnect() {
    await readyPromise;
    clearSession();
    state.error = null;
    render();
  }

  async function credential() {
    await readyPromise;
    state.session = loadSession();
    if (!state.session) {
      render();
      throw new Error("Sign in with NyxID before starting release-bound research.");
    }
    return state.session.access_token;
  }

  async function actor() {
    await readyPromise;
    state.session = loadSession();
    if (!state.session) {
      render();
      throw new Error("Sign in with NyxID before identifying the research actor.");
    }
    return state.session.actor_ref;
  }

  window.trureturingResearchCredential = credential;
  window.trureturingResearchActor = actor;
  window.TrureturingNyxIdAuth = Object.freeze({
    signIn,
    disconnect,
    state() {
      return Core.publicState(
        state.session,
        Boolean(state.config && state.config.enabled),
        state.error
      );
    }
  });

  signInButton.addEventListener("click", () => {
    signIn().catch((error) => {
      state.error = error.message;
      render();
    });
  });
  disconnectButton.addEventListener("click", () => {
    disconnect().catch((error) => {
      state.error = error.message;
      render();
    });
  });

  if (researchConsole) {
    researchConsole.addEventListener("submit", (event) => {
      state.session = state.config ? loadSession() : null;
      if (state.session) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      signIn().catch((error) => {
        state.error = error.message;
        render();
      });
    }, true);
  }

  window.addEventListener("pageshow", () => {
    if (!state.ready || !state.config) return;
    state.session = loadSession();
    render();
  });

  const readyPromise = initialize();
}());
