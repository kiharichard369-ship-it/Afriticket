import { Route, Routes } from "react-router-dom";
import { Layout } from "./components/layout/Layout";
import { DiscoveryPage } from "./pages/DiscoveryPage";
import { EventDetailPage } from "./pages/EventDetailPage";
import { CalendarPage } from "./pages/CalendarPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { LoginPage } from "./pages/LoginPage";
import { SignUpPage } from "./pages/SignUpPage";
import { OrganiserApplyPage } from "./pages/OrganiserApplyPage";
import { OrganiserDashboardPage } from "./pages/OrganiserDashboardPage";
import { OrganiserEventFormPage } from "./pages/OrganiserEventFormPage";
import { OrganiserCheckinPage } from "./pages/OrganiserCheckinPage";
import { MyTicketsPage } from "./pages/MyTicketsPage";
import { AccountSettingsPage } from "./pages/AccountSettingsPage";
import { AdminModerationPage } from "./pages/AdminModerationPage";
import { RequireAuth, RequireOrganiser, RequirePlatformStaff } from "./components/auth/RouteGuards";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<DiscoveryPage />} />
        <Route path="events/:slug" element={<EventDetailPage />} />
        <Route path="calendar" element={<CalendarPage />} />
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
          path="admin/moderation"
          element={
            <RequirePlatformStaff>
              <AdminModerationPage />
            </RequirePlatformStaff>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
