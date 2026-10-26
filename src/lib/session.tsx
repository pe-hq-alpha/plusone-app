import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ClerkProvider, useAuth, useClerk } from "@clerk/react";
import { ConvexHttpClient } from "convex/browser";
import { ConvexProviderWithAuth, type ConvexReactClient } from "convex/react";
import { useNavigate } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import { record } from "./analytics/client";
import { EVENTS } from "./analytics/events";
import { clearAgreement, pendingAgreement } from "./terms";
import { useTheme, type Theme } from "./theme";

/**
 * Who is signed in, in one place. Accounts sign in with Clerk. The demo has no account:
 * its visitor gets this deployment's own short-lived guest token (Clerk has no
 * anonymous users), kept in the browser and refreshed before it runs out. Signing in
 * with Clerk ends any demo. The first time a Clerk account signs in, its row is made,
 * or found by email for someone who had an account before (`users.syncClerk`).
 */

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;
const DEMO_KEY = "plusone.demo.session";

type DemoTokens = { token: string; refreshToken: string };
type FetchToken = (args: { forceRefreshToken: boolean }) => Promise<string | null>;
type AuthState = { isLoading: boolean; isAuthenticated: boolean; fetchAccessToken: FetchToken };
type Actions = {
  /** Only "anonymous" is left: the demo's guest. Accounts sign in through Clerk's pages. */
  signIn: (provider: "anonymous") => Promise<void>;
  signOut: () => Promise<void>;
  /** Why the last account sign-in couldn't finish, to show on the sign-in page. */
  error: string | null;
};

// Storage can be blocked (a private window); the demo still works for this visit.
let memory: DemoTokens | null = null;
function readDemo(): DemoTokens | null {
  try {
    const raw = localStorage.getItem(DEMO_KEY);
    return raw ? (JSON.parse(raw) as DemoTokens) : memory;
  } catch {
    return memory;
  }
}
function writeDemo(tokens: DemoTokens | null) {
  memory = tokens;
  try {
    if (tokens) localStorage.setItem(DEMO_KEY, JSON.stringify(tokens));
    else localStorage.removeItem(DEMO_KEY);
  } catch {
    /* kept in memory instead */
  }
}
/** A token with under a minute left is refreshed rather than sent. */
function expiresSoon(jwt: string): boolean {
  try {
    const body = JSON.parse(atob(jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))) as { exp?: number };
    return !body.exp || body.exp * 1000 - Date.now() < 60_000;
  } catch {
    return true;
  }
}

const AuthContext = createContext<AuthState | null>(null);
const ActionsContext = createContext<Actions | null>(null);
const useAuthState = () => useContext(AuthContext)!;

export function useAuthActions(): Actions {
  const actions = useContext(ActionsContext);
  if (!actions) throw new Error("useAuthActions needs SessionProvider");
  return actions;
}

/** The sign-in card in the app's own colours (index.css), for each theme. */
const CLERK_COLOURS: Record<Theme, { colorPrimary: string; colorPrimaryForeground: string; colorForeground: string; colorMutedForeground: string; colorBackground: string; colorInput: string; colorInputForeground: string; colorBorder: string; colorDanger: string }> = {
  light: {
    colorPrimary: "#1f2a5c",
    colorPrimaryForeground: "#fefcf7",
    colorForeground: "#1c1f29",
    colorMutedForeground: "#4b4e58",
    colorBackground: "#fffdfa",
    colorInput: "#ffffff",
    colorInputForeground: "#1c1f29",
    colorBorder: "#e9e6df",
    colorDanger: "#9b2c2c",
  },
  dark: {
    colorPrimary: "#f4b53a",
    colorPrimaryForeground: "#11141c",
    colorForeground: "#e8eaf0",
    colorMutedForeground: "#b3b7c3",
    colorBackground: "#181c26",
    colorInput: "#141822",
    colorInputForeground: "#e8eaf0",
    colorBorder: "#272c39",
    colorDanger: "#ff9d98",
  },
};

export function SessionProvider({ client, convexUrl, children }: { client: ConvexReactClient; convexUrl: string; children: ReactNode }) {
  const navigate = useNavigate();
  const theme = useTheme();
  if (!PUBLISHABLE_KEY) {
    return <p style={{ fontFamily: "sans-serif", padding: "2rem" }}>Missing <code>VITE_CLERK_PUBLISHABLE_KEY</code>.</p>;
  }
  return (
    <ClerkProvider
      publishableKey={PUBLISHABLE_KEY}
      routerPush={(to) => navigate(to)}
      routerReplace={(to) => navigate(to, { replace: true })}
      signInUrl="/signin"
      signUpUrl="/signin?new=1"
      afterSignOutUrl="/"
      appearance={{
        variables: { ...CLERK_COLOURS[theme], fontFamily: '"Work Sans Variable", "Work Sans", ui-sans-serif, system-ui, sans-serif', borderRadius: "12px" },
        elements: {
          card: { boxShadow: theme === "dark" ? "0 18px 40px -24px rgba(0,0,0,.6)" : "0 10px 24px -18px rgba(21,26,43,.35)", border: `1px solid ${CLERK_COLOURS[theme].colorBorder}` },
          headerTitle: { fontFamily: '"EB Garamond Variable", "EB Garamond", Georgia, serif', fontWeight: 500, fontSize: "1.6rem" },
        },
      }}
    >
      <Sessions client={client} convexUrl={convexUrl}>
        {children}
      </Sessions>
    </ClerkProvider>
  );
}

function Sessions({ client, convexUrl, children }: { client: ConvexReactClient; convexUrl: string; children: ReactNode }) {
  const http = useMemo(() => new ConvexHttpClient(convexUrl), [convexUrl]);
  const clerk = useAuth();
  const { signOut: clerkSignOut } = useClerk();
  const [demo, setDemo] = useState<DemoTokens | null>(() => readDemo());
  const demoRef = useRef(demo);
  const refreshing = useRef<Promise<string | null> | null>(null);
  const [synced, setSynced] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Clerk's getToken is read through a ref so a new function each render never
  // makes Convex sign in again.
  const getTokenRef = useRef(clerk.getToken);
  getTokenRef.current = clerk.getToken;

  const saveDemo = useCallback((tokens: DemoTokens | null) => {
    writeDemo(tokens);
    demoRef.current = tokens;
    setDemo(tokens);
  }, []);

  const demoToken = useCallback(
    async (force: boolean): Promise<string | null> => {
      const current = demoRef.current;
      if (!current) return null;
      if (!force && !expiresSoon(current.token)) return current.token;
      refreshing.current ??= http
        .action(api.auth.signIn, { refreshToken: current.refreshToken })
        .then(
          (r) => {
            // No tokens back means the session is over (expired or cleaned up).
            const next = r.tokens ?? null;
            saveDemo(next);
            return next?.token ?? null;
          },
          () => null,
        )
        .finally(() => {
          refreshing.current = null;
        });
      return refreshing.current;
    },
    [http, saveDemo],
  );

  const signedIn = clerk.isLoaded && clerk.isSignedIn === true;
  const sessionId = clerk.sessionId ?? null;
  const clerkReady = signedIn && synced === sessionId;

  // An account's first moment: make or find its row, then let the app in. This runs on
  // every visit, so a blip (a dropped connection, a slow token) is retried rather than
  // ending a session Clerk keeps for days; only the server saying no signs the person out.
  useEffect(() => {
    if (!signedIn || !sessionId || synced === sessionId) return;
    let live = true;
    void (async () => {
      for (let attempt = 0; live; attempt++) {
        try {
          const token = await getTokenRef.current({ template: "convex" });
          if (!token) throw new Error("No token from Clerk");
          const once = new ConvexHttpClient(convexUrl);
          once.setAuth(token);
          const { created } = await once.mutation(api.users.syncClerk, {});
          if (created) record(EVENTS.accountCreated, { method: "clerk" });
          // The "I agree" box ticked on the sign-in page, recorded against the account.
          const agreed = pendingAgreement();
          if (agreed) {
            try {
              await once.mutation(api.users.acceptTerms, { version: agreed });
              clearAgreement();
            } catch {
              // kept for the next visit; never a reason to sign someone out
            }
          }
          if (demoRef.current) saveDemo(null);
          if (live) {
            setError(null);
            setSynced(sessionId);
          }
          return;
        } catch (e) {
          if (!live) return;
          const data = (e as { data?: unknown }).data;
          if (typeof data === "string") {
            setError(data);
            void clerkSignOut();
            return;
          }
          await new Promise((r) => setTimeout(r, Math.min(15_000, 1000 * 2 ** attempt)));
        }
      }
    })();
    return () => {
      live = false;
    };
  }, [signedIn, sessionId, synced, convexUrl, saveDemo, clerkSignOut]);

  const hasDemo = demo !== null;
  const fetchAccessToken = useCallback<FetchToken>(
    async ({ forceRefreshToken }) => {
      if (clerkReady) {
        try {
          return await getTokenRef.current({ template: "convex", skipCache: forceRefreshToken });
        } catch {
          return null;
        }
      }
      return hasDemo ? await demoToken(forceRefreshToken) : null;
    },
    [clerkReady, hasDemo, demoToken],
  );

  const auth = useMemo<AuthState>(
    () => ({
      isLoading: !clerk.isLoaded || (signedIn && !clerkReady),
      isAuthenticated: clerkReady || (!signedIn && hasDemo),
      fetchAccessToken,
    }),
    [clerk.isLoaded, signedIn, clerkReady, hasDemo, fetchAccessToken],
  );

  const actions = useMemo<Actions>(
    () => ({
      error,
      async signIn() {
        const r = await http.action(api.auth.signIn, { provider: "anonymous" });
        if (!r.tokens) throw new Error("Could not start the demo");
        saveDemo(r.tokens);
      },
      async signOut() {
        const current = demoRef.current;
        if (current) {
          // Best effort: end the guest's session on the server too.
          try {
            const once = new ConvexHttpClient(convexUrl);
            once.setAuth(current.token);
            await once.action(api.auth.signOut, {});
          } catch {
            /* it expires on its own */
          }
          saveDemo(null);
        }
        if (signedIn) {
          setSynced(null);
          await clerkSignOut();
        }
      },
    }),
    [error, http, convexUrl, saveDemo, signedIn, clerkSignOut],
  );

  return (
    <ActionsContext.Provider value={actions}>
      <AuthContext.Provider value={auth}>
        <ConvexProviderWithAuth client={client} useAuth={useAuthState}>
          {children}
        </ConvexProviderWithAuth>
      </AuthContext.Provider>
    </ActionsContext.Provider>
  );
}
