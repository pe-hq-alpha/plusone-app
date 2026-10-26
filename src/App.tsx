import { Authenticated, AuthLoading, Unauthenticated, useConvexAuth } from "convex/react";
import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import { goHome, goToApp, HOME_PATHS, onAppHost, onHomeHost } from "./lib/hosts";
import { LandingPage } from "./pages/LandingPage";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { EventLayout } from "./components/EventLayout";
import { UpdatePrompt } from "./components/UpdatePrompt";
import { RequireAccount } from "./components/RequireAccount";
import { LeaveDemo } from "./components/LeaveDemo";
import { Splash } from "./components/Splash";

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
const InboxPage = page(() => import("./pages/InboxPage"), "InboxPage");
const GuestsPage = page(() => import("./pages/GuestsPage"), "GuestsPage");
const AssistantPage = page(() => import("./pages/AssistantPage"), "AssistantPage");
const MembersPage = page(() => import("./pages/MembersPage"), "MembersPage");
const SettingsPage = page(() => import("./pages/SettingsPage"), "SettingsPage");
const JoinPage = page(() => import("./pages/JoinPage"), "JoinPage");
const HowItWorksPage = page(() => import("./pages/HowItWorksPage"), "HowItWorksPage");
const GuestPage = page(() => import("./pages/GuestPage"), "GuestPage");
const AccountPage = page(() => import("./pages/AccountPage"), "AccountPage");
const PrivacyPage = page(() => import("./pages/PrivacyPage"), "PrivacyPage");
const TermsPage = page(() => import("./pages/TermsPage"), "TermsPage");
const SignInPage = page(() => import("./pages/SignInPage"), "SignInPage");

export default function App() {
  return (
    <>
      <Splash />
      <UpdatePrompt />
      <Suspense fallback={<FullPage>Loading…</FullPage>}>
      <HostGate>
      <Routes>
        <Route path="/how-it-works" element={<HowItWorksPage />} />
        <Route path="/join/:token" element={<JoinPage />} />
        <Route path="/s/:slug" element={<SitePage />} />
        <Route path="/r/:token" element={<RsvpPage />} />
        <Route path="/p/:token" element={<SharedPlanPage />} />
        <Route path="/demo" element={<GuestPage />} />
        <Route path="/guest" element={<Navigate to="/demo" replace />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route
          path="/*"
          element={
            <>
              <AuthLoading>
                <FullPage>Loading…</FullPage>
              </AuthLoading>
              <Unauthenticated>
                <Routes>
                  <Route path="/signin" element={<SignInPage />} />
                  <Route path="*" element={<LandingPage />} />
                </Routes>
              </Unauthenticated>
              <Authenticated>
                <a href="#main" className="skip-link">Skip to content</a>
                <ErrorBoundary>
                <Routes>
                  <Route path="/" element={<LeaveDemo><HomePage /></LeaveDemo>} />
                  <Route path="/signin" element={<LeaveDemo><Navigate to="/" replace /></LeaveDemo>} />
                  <Route path="/new" element={<RequireAccount><NewEventPage /></RequireAccount>} />
                  <Route path="/new/manual" element={<RequireAccount><OnboardingPage /></RequireAccount>} />
                  <Route path="/account" element={<AccountPage />} />
                  <Route path="/share" element={<SharePage />} />
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
              </Authenticated>
            </>
          }
        />
      </Routes>
      </HostGate>
      </Suspense>
    </>
  );
}

/** Pages on the app's address that work without signing in. */
const APP_PUBLIC = /^\/(signin|demo|guest|how-it-works|privacy)\/?$|^\/(join|s|r|p)\//;

/**
 * Keeps each page on its own address. On the home address, anything that goes into
 * the app (sign in, the demo, an event) moves to the app's address. On the app's
 * address, someone signed out who isn't on a public page goes to the home page.
 */
function HostGate({ children }: { children: ReactNode }) {
  const { pathname, search, hash } = useLocation();
  const { isLoading, isAuthenticated } = useConvexAuth();
  const toApp = onHomeHost() && !HOME_PATHS.has(pathname);
  const toHome = onAppHost() && !isLoading && !isAuthenticated && !APP_PUBLIC.test(pathname);
  useEffect(() => {
    if (toApp) goToApp(pathname + search + hash);
    else if (toHome) goHome();
  }, [toApp, toHome, pathname, search, hash]);
  if (toApp || toHome) return <FullPage>Loading…</FullPage>;
  return <>{children}</>;
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
