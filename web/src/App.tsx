import { useEffect, useState } from "react";
import { QueryCache, QueryClient, QueryClientProvider, useIsFetching, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "./api/client.js";
import type { ThemeName } from "./api/config.js";
import { useLogout, useNotifications, useSession } from "./hooks/queries.js";
import { useTheme } from "./hooks/useTheme.js";
import { Login } from "./components/Login.js";
import { Topbar } from "./components/Topbar.js";
import { OrdersView } from "./components/OrdersView.js";
import { OrderDialog } from "./components/OrderDialog.js";
import { NotificationsDialog } from "./components/NotificationsDialog.js";
import { PlatformsDialog } from "./components/PlatformsDialog.js";
import { ErrorState } from "./components/StateViews.js";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 15_000 },
  },
  queryCache: new QueryCache({
    onError: (error) => {
      // Любой 401 переводит приложение на экран входа (никакого «полуживого» состояния).
      if (error instanceof ApiError && error.status === 401) {
        void queryClient.invalidateQueries({ queryKey: ["session"] });
      }
    },
  }),
});

function ProgressBar() {
  const fetching = useIsFetching();
  if (fetching === 0) return null;
  return (
    <div className="progress" role="progressbar" aria-label="Идёт загрузка">
      <div className="progress__bar" />
    </div>
  );
}

function Splash({ label }: { label: string }) {
  return (
    <div className="state" role="status" aria-live="polite" style={{ minHeight: "60vh", display: "grid", placeItems: "center" }}>
      <div>
        <p>{label}</p>
      </div>
    </div>
  );
}

function Shell({ user, theme, onToggleTheme }: { user: string | null; theme: ThemeName; onToggleTheme: () => void }) {
  const logout = useLogout();
  const notifications = useNotifications(true);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showPlatforms, setShowPlatforms] = useState(false);

  const unread = notifications.data?.unread ?? 0;

  return (
    <div className="app">
      <Topbar
        unread={unread}
        theme={theme}
        onToggleTheme={onToggleTheme}
        onOpenNotifications={() => setShowNotifications(true)}
        onOpenPlatforms={() => setShowPlatforms(true)}
        onLogout={() => logout.mutate()}
        user={user}
      />
      <main className="container">
        <OrdersView onOpenOrder={setOrderId} />
      </main>

      {orderId ? <OrderDialog id={orderId} onClose={() => setOrderId(null)} /> : null}
      {showNotifications ? (
        <NotificationsDialog onClose={() => setShowNotifications(false)} onOpenOrder={setOrderId} />
      ) : null}
      {showPlatforms ? <PlatformsDialog onClose={() => setShowPlatforms(false)} /> : null}
    </div>
  );
}

function AppContent() {
  const session = useSession();
  const qc = useQueryClient();
  // Тема применяется на корне приложения, а не только внутри Shell: иначе экран
  // входа и состояния загрузки игнорируют сохранённый светлый выбор.
  const { theme, toggle } = useTheme();

  // Приложение отрисовалось — сообщаем shell-загрузчику, что можно снять оверлей.
  useEffect(() => {
    window.__APP_READY__ = true;
    window.__LOGUS_LOADER__?.end();
  }, []);

  // Регистрация service worker для установки PWA и офлайн-оболочки.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const secure = window.isSecureContext || location.hostname === "localhost" || location.hostname === "127.0.0.1";
    if (!secure) return;
    navigator.serviceWorker.register("./sw.js").catch((err) => {
      window.__LOGUS_LOADER__?.warn(`service worker не зарегистрирован: ${String(err)}`);
    });
  }, []);

  if (session.isPending) {
    return <Splash label="Проверяем сессию…" />;
  }

  if (session.isError) {
    const msg = session.error instanceof ApiError ? session.error.message : "Сервер недоступен";
    return (
      <div className="container">
        <ErrorState message={msg} onRetry={() => void qc.invalidateQueries({ queryKey: ["session"] })} />
      </div>
    );
  }

  if (session.data?.setupRequired) {
    return (
      <div className="container">
        <ErrorState message="Сервер не настроен: заполните private/secrets.php и перезапустите." />
      </div>
    );
  }

  if (!session.data?.authorized) {
    return <Login />;
  }

  return <Shell user={session.data.user} theme={theme} onToggleTheme={toggle} />;
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ProgressBar />
      <AppContent />
    </QueryClientProvider>
  );
}
