import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

/**
 * Единый источник «видового» состояния кабинета: какие окна открыты и какие
 * фильтры выбраны. Помощник управляет интерфейсом через те же сеттеры, что и
 * пользователь, поэтому обучение идёт по реальным путям, без дублей логики.
 */
export interface AppUi {
  orderId: string | null;
  setOrderId: (id: string | null) => void;
  showNotifications: boolean;
  setShowNotifications: (v: boolean) => void;
  showPlatforms: boolean;
  setShowPlatforms: (v: boolean) => void;
  platform: string;
  setPlatform: (v: string) => void;
  status: string;
  setStatus: (v: string) => void;
  closeDialogs: () => void;
}

const Ctx = createContext<AppUi | null>(null);

export function AppUiProvider({ children }: { children: ReactNode }) {
  const [orderId, setOrderId] = useState<string | null>(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showPlatforms, setShowPlatforms] = useState(false);
  const [platform, setPlatform] = useState("");
  const [status, setStatus] = useState("");

  const value = useMemo<AppUi>(
    () => ({
      orderId,
      setOrderId,
      showNotifications,
      setShowNotifications,
      showPlatforms,
      setShowPlatforms,
      platform,
      setPlatform,
      status,
      setStatus,
      closeDialogs: () => {
        setOrderId(null);
        setShowNotifications(false);
        setShowPlatforms(false);
      },
    }),
    [orderId, showNotifications, showPlatforms, platform, status],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppUi(): AppUi {
  const value = useContext(Ctx);
  if (!value) throw new Error("useAppUi должен вызываться внутри AppUiProvider");
  return value;
}
