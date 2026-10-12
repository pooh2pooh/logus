import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import "./styles.css";

// Сообщаем загрузчику, что видимостью оверлея управляет приложение (ScreenLoader):
// shell не должен прятать лоадер сам, иначе на миг мелькнёт промежуточный экран.
// Старый бандл из офлайн-кэша этот флаг не выставляет — для него shell скроет
// оверлей по готовности, как раньше.
window.__LOGUS_OVERLAY_CONTROLLED__ = true;

// Защита от двойного монтирования: если основной бандл и резервная копия
// загрузятся оба, повторный запуск не должен создавать второе приложение.
if (!window.__LOGUS_APP_MOUNTED__) {
  window.__LOGUS_APP_MOUNTED__ = true;

  const container = document.getElementById("root");
  if (!container) throw new Error("Root container #root not found");

  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
