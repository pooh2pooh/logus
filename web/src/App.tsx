import { useEffect, useLayoutEffect, useState } from "react";
import { QueryCache, QueryClient, QueryClientProvider, useIsFetching, useIsMutating, useQueryClient } from "@tanstack/react-query";
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
    onError: (error, query) => {
      // Любой 401 переводит приложение на экран входа (никакого «полуживого» состояния).
      // Саму сессию не трогаем — иначе получили бы цикл «ошибка → refetch → ошибка».
      if (error instanceof ApiError && error.status === 401 && query.queryKey[0] !== "session") {
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

/**
 * Держит shell-оверлей (лоадер) поверх приложения, пока идёт любой переход:
 * проверка/перезапрос сессии, вход/выход, первичная загрузка данных экрана
 * или мутации. Пользователь видит либо полностью отрисованный интерфейс,
 * либо лоадер — промежуточные «скелетоны» и полупустые экраны скрыты.
 */
function ScreenLoader() {
  const session = useSession();
  const loading = useIsFetching({
    predicate: (query) => query.state.data === undefined && query.queryKey[0] !== "session",
  });
  const mutating = useIsMutating();
  const busy = session.isPending || session.isFetching || loading > 0 || mutating > 0;

  // Layout-эффект: переключаем оверлей до отрисовки кадра, чтобы не мелькал
  // промежуточный экран между «готово» и показом лоадера.
  useLayoutEffect(() => {
    const loader = window.__LOGUS_LOADER__;
    if (!loader) return;
    if (busy) loader.show();
    else loader.hide();
  }, [busy]);

  return null;
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
  const { theme, toggle } =   useTheme();

  // Приложение отрисовалось — снимаем watchdog загрузчика. Оверлей при этом
  // НЕ убираем: видимостью управляет ScreenLoader (см. __LOGUS_OVERLAY_CONTROLLED__).
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
    // 401 на проверке сессии — это просто «не авторизован», а не сбой:
    // показываем экран входа, а не ошибку.
    if (session.error instanceof ApiError && session.error.status === 401) {
      return <Login />;
    }
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
      <ScreenLoader />
      <ProgressBar />
      <AppContent />
    </QueryClientProvider>
  );
}
