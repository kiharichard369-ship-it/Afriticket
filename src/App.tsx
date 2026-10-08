import { Route, Routes } from "react-router-dom";
import { Layout } from "./components/layout/Layout";
import { DiscoveryPage } from "./pages/DiscoveryPage";
import { EventDetailPage } from "./pages/EventDetailPage";
import { CalendarPage } from "./pages/CalendarPage";
import { AboutPage } from "./pages/AboutPage";
import { HelpPage } from "./pages/HelpPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { LoginPage } from "./pages/LoginPage";
import { SignUpPage } from "./pages/SignUpPage";
import { OrganiserApplyPage } from "./pages/OrganiserApplyPage";
import { OrganiserDashboardPage } from "./pages/OrganiserDashboardPage";
import { OrganiserEventFormPage } from "./pages/OrganiserEventFormPage";
import { OrganiserCheckinPage } from "./pages/OrganiserCheckinPage";
import { OrganiserAttendeesPage } from "./pages/OrganiserAttendeesPage";
import { SupportCheckinPage } from "./pages/SupportCheckinPage";
import { MyTicketsPage } from "./pages/MyTicketsPage";
import { AccountSettingsPage } from "./pages/AccountSettingsPage";
import { ProfilePage } from "./pages/ProfilePage";
import { AdminModerationPage } from "./pages/AdminModerationPage";
import { RequireAuth, RequireOrganiser } from "./components/auth/RouteGuards";
import { RequirePlatformRole } from "./components/auth/RequirePlatformRole";
import { RouteSeo } from "./components/seo/RouteSeo";
import { IdleLogout } from "./components/auth/IdleLogout";

export default function App() {
  return (
    <>
      <RouteSeo />
      <IdleLogout />
      <Routes>
        <Route element={<Layout />}>
        <Route index element={<DiscoveryPage />} />
        <Route path="events/:slug" element={<EventDetailPage />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="about" element={<AboutPage />} />
        <Route path="help" element={<HelpPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="signup" element={<SignUpPage />} />
        <Route path="organiser/apply" element={<OrganiserApplyPage />} />
        <Route
          path="organiser/dashboard"
          element={
            <RequireOrganiser>
              <OrganiserDashboardPage />
            </RequireOrganiser>
          }
        />
        <Route
          path="organiser/events/:id"
          element={
            <RequireOrganiser>
              <OrganiserEventFormPage />
            </RequireOrganiser>
          }
        />
        <Route
          path="organiser/events/:eventId/checkin"
          element={
            <RequireOrganiser>
              <OrganiserCheckinPage />
            </RequireOrganiser>
          }
        />
        <Route
          path="organiser/events/:eventId/attendees"
          element={
            <RequireOrganiser>
              <OrganiserAttendeesPage />
            </RequireOrganiser>
          }
        />
        <Route
          path="my-tickets"
          element={
            <RequireAuth>
              <MyTicketsPage />
            </RequireAuth>
          }
        />
        <Route
          path="account"
          element={
            <RequireAuth>
              <AccountSettingsPage />
            </RequireAuth>
          }
        />
        <Route
          path="profile"
          element={
            <RequireAuth>
              <ProfilePage />
            </RequireAuth>
          }
        />
        <Route
          path="admin/moderation"
          element={
            <RequireAuth>
              <RequirePlatformRole allow={["admin"]}>
                <AdminModerationPage />
              </RequirePlatformRole>
            </RequireAuth>
          }
        />
        <Route
          path="staff/checkin"
          element={
            <RequireAuth>
              <RequirePlatformRole allow={["support", "admin"]}>
                <SupportCheckinPage />
              </RequirePlatformRole>
            </RequireAuth>
          }
        />
        <Route
          path="staff/events/:eventId/checkin"
          element={
            <RequireAuth>
              <RequirePlatformRole allow={["support", "admin"]}>
                <OrganiserCheckinPage />
              </RequirePlatformRole>
            </RequireAuth>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </>
  );
}