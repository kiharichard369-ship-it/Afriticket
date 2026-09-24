import { Outlet } from "react-router-dom";
import { UtilityBar } from "./UtilityBar";
import { Header } from "./Header";
import { Footer } from "./Footer";
import { SupportButton } from "./SupportButton";

export function Layout() {
  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-saffron focus:px-4 focus:py-2 focus:text-saffron-ink"
      >
        Skip to content
      </a>
      <UtilityBar />
      <Header />
      <main id="main-content" className="flex-1">
        <Outlet />
      </main>
      <Footer />
      <SupportButton />
    </div>
  );
}
