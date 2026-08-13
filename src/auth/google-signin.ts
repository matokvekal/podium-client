// Google Identity Services, loaded on demand.
//
// Google only answers "who is this person". The ID token it returns is sent once to
// POST /auth/google, and from then on the app uses the server's own tokens — the ID token
// is never stored and never sent anywhere else.

import { config } from "../lib/config";

const SCRIPT_URL = "https://accounts.google.com/gsi/client";
const SCRIPT_ID = "google-identity-services";

interface CredentialResponse {
  credential?: string;
}

interface GoogleAccounts {
  accounts: {
    id: {
      initialize(options: {
        client_id: string;
        callback: (response: CredentialResponse) => void;
        auto_select?: boolean;
        cancel_on_tap_outside?: boolean;
      }): void;
      renderButton(parent: HTMLElement, options: Record<string, unknown>): void;
      prompt(): void;
      disableAutoSelect(): void;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleAccounts;
  }
}

let loader: Promise<GoogleAccounts> | null = null;

export class GoogleSignInUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleSignInUnavailableError";
  }
}

/** Loads the Google script once. Rejects offline — the caller shows SMS sign-in instead. */
export function loadGoogleIdentity(): Promise<GoogleAccounts> {
  if (!config.googleClientId) {
    return Promise.reject(new GoogleSignInUnavailableError("VITE_GOOGLE_CLIENT_ID is not set"));
  }
  if (window.google) return Promise.resolve(window.google);

  loader ??= new Promise<GoogleAccounts>((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    const script = existing ?? document.createElement("script");

    script.id = SCRIPT_ID;
    script.src = SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.addEventListener("load", () => {
      if (window.google) resolve(window.google);
      else reject(new GoogleSignInUnavailableError("Google sign-in failed to initialise"));
    });
    script.addEventListener("error", () => {
      loader = null;
      reject(new GoogleSignInUnavailableError("Google sign-in could not be reached"));
    });

    if (!existing) document.head.appendChild(script);
  });

  return loader;
}

/**
 * Renders Google's own button into `parent` and calls back with the ID token. Google
 * requires its rendered button — a custom one is not permitted for this flow.
 */
export async function renderGoogleButton(
  parent: HTMLElement,
  onCredential: (idToken: string) => void,
): Promise<void> {
  const google = await loadGoogleIdentity();

  google.accounts.id.initialize({
    client_id: config.googleClientId,
    callback: (response) => {
      if (response.credential) onCredential(response.credential);
    },
    cancel_on_tap_outside: true,
  });

  google.accounts.id.renderButton(parent, {
    type: "standard",
    theme: "outline",
    size: "large",
    text: "continue_with",
    shape: "pill",
    width: 280,
  });
}

/** Stops Google from silently re-signing the rider in after they deliberately signed out. */
export function forgetGoogleSession(): void {
  window.google?.accounts.id.disableAutoSelect();
}
