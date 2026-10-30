import { useConvexAuth } from "convex/react";
import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import { goHome, goToApp, goToOps, goToPartner, hasOpsHost, hasPartnerHost, HOME_PATHS, ON_OPS_PATH, ON_PARTNER_PATH, onAppHost, onHomeHost, onOpsHost, onPartnerHost, OPS_PATHS, PARTNER_PATHS } from "./lib/hosts";
import { LandingPage } from "./pages/LandingPage";
import { PlanLinkPage } from "./pages/PlanLinkPage";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { EventLayout } from "./components/EventLayout";
import { UpdatePrompt } from "./components/UpdatePrompt";
import { RequireAccount } from "./components/RequireAccount";
import { LeaveDemo } from "./components/LeaveDemo";
import { Splash } from "./components/Splash";
import { likelySignedOut } from "./lib/session";

// Each page loads as its own file, so the first visit downloads only what it shows.
// The landing page stays in the main bundle because it is what a new visitor sees first.
const page = <K extends string>(load: () => Promise<Record<K, React.ComponentType>>, name: K) =>
  lazy(() => load().then((m) => ({ default: m[name] })));
const HomePage = page(() => import("./pages/HomePage"), "HomePage");
const OnboardingPage = page(() => import("./pages/OnboardingPage"), "OnboardingPage");
const NewEventPage = page(() => import("./pages/NewEventPage"), "NewEventPage");
const TodayPage = page(() => import("./pages/TodayPage"), "TodayPage");
const PlanPage = page(() => import("./pages/PlanPage"), "PlanPage");
const CeremonyPage = page(() => import("./pages/CeremonyPage"), "CeremonyPage");
const TasksPage = page(() => import("./pages/TasksPage"), "TasksPage");
const BudgetPage = page(() => import("./pages/BudgetPage"), "BudgetPage");
const HistoryPage = page(() => import("./pages/HistoryPage"), "HistoryPage");
const SpacesPage = page(() => import("./pages/SpacesPage"), "SpacesPage");
const SharePage = page(() => import("./pages/SharePage"), "SharePage");
const PrintPage = page(() => import("./pages/PrintPage"), "PrintPage");
const WebsitePage = page(() => import("./pages/WebsitePage"), "WebsitePage");
const GiftsPage = page(() => import("./pages/GiftsPage"), "GiftsPage");
const SitePage = page(() => import("./pages/SitePage"), "SitePage");
const RsvpPage = page(() => import("./pages/RsvpPage"), "RsvpPage");
const SharedPlanPage = page(() => import("./pages/SharedPlanPage"), "SharedPlanPage");
const HelpPage = page(() => import("./pages/HelpPage"), "HelpPage");
const VendorsPage = page(() => import("./pages/VendorsPage"), "VendorsPage");
const DecisionsPage = page(() => import("./pages/DecisionsPage"), "DecisionsPage");
const VenuePage = page(() => import("./pages/VenuePage"), "VenuePage");
const InboxPage = page(() => import("./pages/InboxPage"), "InboxPage");
const GuestsPage = page(() => import("./pages/GuestsPage"), "GuestsPage");
const AssistantPage = page(() => import("./pages/AssistantPage"), "AssistantPage");
const MembersPage = page(() => import("./pages/MembersPage"), "MembersPage");
const SettingsPage = page(() => import("./pages/SettingsPage"), "SettingsPage");
const JoinPage = page(() => import("./pages/JoinPage"), "JoinPage");
const HowItWorksPage = page(() => import("./pages/HowItWorksPage"), "HowItWorksPage");
const PricingPage = page(() => import("./pages/PricingPage"), "PricingPage");
const FindVendorsPage = page(() => import("./pages/FindVendorsPage"), "FindVendorsPage");
const VendorListingPage = page(() => import("./pages/FindVendorsPage"), "VendorListingPage");
const GuestPage = page(() => import("./pages/GuestPage"), "GuestPage");
const AccountPage = page(() => import("./pages/AccountPage"), "AccountPage");
const PrivacyPage = page(() => import("./pages/PrivacyPage"), "PrivacyPage");
const TermsPage = page(() => import("./pages/TermsPage"), "TermsPage");
const SignInPage = page(() => import("./pages/SignInPage"), "SignInPage");
const VendorSignInPage = page(() => import("./pages/SignInPage"), "VendorSignInPage");
const PartnerPage = page(() => import("./partner/PartnerPage"), "PartnerPage");
const OpsPage = page(() => import("./partner/OpsPage"), "OpsPage");
const VendorDemoPage = page(() => import("./partner/VendorDemoPage"), "VendorDemoPage");

export default function App() {
  return (
    <>
      <Splash />
      <UpdatePrompt />
      <Suspense fallback={<Waiting />}>
      {/* The public pages too: a bad link or a failed query shows a message, never a blank page. */}
      <ErrorBoundary>
      <HostGate>
      {onPartnerHost() ? <PartnerRoutes /> : onOpsHost() ? <OpsRoutes /> : (
      <Routes>
        <Route path="/how-it-works" element={<HowItWorksPage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/vendors" element={<FindVendorsPage />} />
        <Route path="/vendors/:profileId" element={<VendorListingPage />} />
        <Route path="/join/:token" element={<JoinPage />} />
        <Route path="/s/:slug" element={<SitePage />} />
        <Route path="/r/:token" element={<RsvpPage />} />
        <Route path="/p/:token" element={<SharedPlanPage />} />
        <Route path="/demo" element={<GuestPage />} />
        <Route path="/partner/demo" element={<VendorDemoPage />} />
        <Route path="/guest" element={<Navigate to="/demo" replace />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route
          path="/*"
          element={
            <SignedInOrOut
              signedOut={
                <Routes>
                  <Route path="/signin" element={<SignInPage />} />
                  <Route path="/partner" element={<VendorSignInPage />} />
                  <Route path="/e/*" element={<PlanLinkPage />} />
                  <Route path="*" element={<LandingPage />} />
                </Routes>
              }
            >
                <a href="#main" className="skip-link">Skip to content</a>
                <ErrorBoundary>
                <Routes>
                  <Route path="/" element={<LeaveDemo><HomePage /></LeaveDemo>} />
                  <Route path="/signin" element={<LeaveDemo><Navigate to="/" replace /></LeaveDemo>} />
                  <Route path="/new" element={<RequireAccount><NewEventPage /></RequireAccount>} />
                  <Route path="/new/manual" element={<RequireAccount><OnboardingPage /></RequireAccount>} />
                  <Route path="/account" element={<AccountPage />} />
                  <Route path="/share" element={<SharePage />} />
                  <Route path="/partner" element={<PartnerHome />} />
                  <Route path="/ops" element={<OpsPage />} />
                  <Route path="/e/:eventId" element={<EventLayout />}>
                    <Route index element={<TodayPage />} />
                    <Route path="plan" element={<PlanPage />} />
                    <Route path="sessions/:sessionId" element={<CeremonyPage />} />
                    <Route path="tasks" element={<TasksPage />} />
                    <Route path="budget" element={<BudgetPage />} />
                    <Route path="spaces" element={<SpacesPage />} />
                    <Route path="spaces/:sessionId" element={<SpacesPage />} />
                    {/* Spaces' old address, kept for links and bookmarks. */}
                    <Route path="board/*" element={<ToSpaces />} />
                    <Route path="history" element={<HistoryPage />} />
                    <Route path="print" element={<PrintPage />} />
                    <Route path="website" element={<WebsitePage />} />
                    <Route path="gifts" element={<GiftsPage />} />
                    <Route path="help" element={<HelpPage />} />
                    <Route path="decisions" element={<DecisionsPage />} />
                    <Route path="venue" element={<VenuePage />} />
                    <Route path="vendors" element={<VendorsPage />} />
                    <Route path="vendors/:slotId" element={<VendorsPage />} />
                    <Route path="inbox" element={<InboxPage />} />
                    <Route path="inbox/:threadId" element={<InboxPage />} />
                    <Route path="guests" element={<GuestsPage />} />
                    <Route path="assistant" element={<AssistantPage />} />
                    <Route path="members" element={<MembersPage />} />
                    <Route path="settings" element={<SettingsPage />} />
                  </Route>
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
                </ErrorBoundary>
            </SignedInOrOut>
          }
        />
      </Routes>
      )}
      </HostGate>
      </ErrorBoundary>
      </Suspense>
    </>
  );
}

/**
 * PlusOne Partner on its own address: the vendor's page at /, its sign-in when signed
 * out, and the vendors' demo at /demo. Customers' pages live on the app's address.
 */
function PartnerRoutes() {
  return (
    <Routes>
      <Route path="/demo" element={<VendorDemoPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route
        path="/*"
        element={
          <SignedInOrOut signedOut={<VendorSignInPage />}>
            <a href="#main" className="skip-link">Skip to content</a>
            <ErrorBoundary>
              <PartnerHome />
            </ErrorBoundary>
          </SignedInOrOut>
        }
      />
    </Routes>
  );
}

/**
 * The signed-in pages or the signed-out ones. While sign-in is still being checked, a
 * browser with no sign-in at all (lib/session's likelySignedOut) is shown the signed-out
 * page at once instead of "Loading…"; it stays the same element when the answer comes,
 * so nothing re-mounts or replays. Anyone signed in waits for the real answer.
 */
function SignedInOrOut({ signedOut, children }: { signedOut: ReactNode; children: ReactNode }) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const [hint] = useState(likelySignedOut);
  if (isLoading) return hint ? <>{signedOut}</> : <Waiting />;
  return isAuthenticated ? <>{children}</> : <>{signedOut}</>;
}

/** Pages on the app's address that work without signing in. */
const APP_PUBLIC = /^\/(signin|partner|partner\/demo|ops|demo|guest|how-it-works|pricing|privacy|vendors)\/?$|^\/(join|s|r|p|vendors|e)\//;

/**
 * Partner's own page. A guest gets there only from the vendors' demo, which says so in
 * the navigation; coming back to Partner's address later ends that sample session, so
 * the visitor sees the sign-in rather than last time's sample business.
 */
function PartnerHome() {
  const { state } = useLocation();
  const fromDemo = Boolean((state as { demo?: boolean } | null)?.demo);
  return (
    <LeaveDemo keep={fromDemo}>
      <PartnerPage />
    </LeaveDemo>
  );
}

/**
 * Ops on its own address: the team's queue at /, sign-in when signed out. Everything
 * else on this address belongs to the app.
 */
function OpsRoutes() {
  return (
    <Routes>
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route
        path="/*"
        element={
          <SignedInOrOut signedOut={<SignInPage />}>
            <a href="#main" className="skip-link">Skip to content</a>
            <ErrorBoundary>
              <OpsPage />
            </ErrorBoundary>
          </SignedInOrOut>
        }
      />
    </Routes>
  );
}

/**
 * Keeps each page on its own address. Ops (/ops) moves to Ops' address, and Partner's pages (/partner, /partner/demo) move to
 * Partner's address from anywhere else. On the home address, anything that goes into
 * the app (sign in, the demo, an event) moves to the app's address, and so does anything
 * on Partner's address that isn't Partner's. On the app's address, someone signed out
 * who isn't on a public page goes to the home page.
 */
function HostGate({ children }: { children: ReactNode }) {
  const { pathname, search, hash } = useLocation();
  const { isLoading, isAuthenticated } = useConvexAuth();
  const toOps = hasOpsHost() && !onOpsHost() && ON_OPS_PATH.test(pathname);
  const toPartner = !toOps && hasPartnerHost() && !onPartnerHost() && ON_PARTNER_PATH.test(pathname);
  const toApp =
    !toOps &&
    !toPartner &&
    ((onHomeHost() && !HOME_PATHS.has(pathname)) ||
      (onPartnerHost() && !PARTNER_PATHS.has(pathname)) ||
      (onOpsHost() && !OPS_PATHS.has(pathname)));
  const toHome = !toOps && !toPartner && onAppHost() && !isLoading && !isAuthenticated && !APP_PUBLIC.test(pathname);
  useEffect(() => {
    if (toOps) goToOps(search + hash);
    else if (toPartner) goToPartner(pathname, search + hash);
    else if (toApp) goToApp(pathname + search + hash);
    else if (toHome) goHome();
  }, [toOps, toPartner, toApp, toHome, pathname, search, hash]);
  if (toOps || toPartner || toApp || toHome) return <Waiting />;
  return <>{children}</>;
}

/** "Loading…" only once a wait is long enough to notice; a quick load shows a calm, empty page. */
function Waiting() {
  const [late, setLate] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setLate(true), 500);
    return () => window.clearTimeout(t);
  }, []);
  return <FullPage>{late ? "Loading…" : null}</FullPage>;
}

export function FullPage({ children }: { children: React.ReactNode }) {
  return (
    <main id="main" className="grid min-h-screen place-items-center p-6 text-muted">
      {children}
    </main>
  );
}

/** Anything under Spaces' old address opens the same place under its new one. */
function ToSpaces() {
  const { eventId, "*": rest } = useParams();
  const { search, hash } = useLocation();
  return <Navigate replace to={{ pathname: `/e/${eventId}/spaces${rest ? `/${rest}` : ""}`, search, hash }} />;
}
