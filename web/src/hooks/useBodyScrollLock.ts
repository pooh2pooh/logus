import { useEffect } from "react";

/**
 * Блокировка прокрутки тела с подсчётом ссылок.
 *
 * Раньше каждое окно сохраняло «предыдущее» значение `overflow` в своём
 * замыкании и восстанавливало его при закрытии. При вложенных или
 * пересекающихся окнах (например, Помощник открывает площадки, а затем
 * карточку заказа) порядок восстановления мог оказаться неверным — и скролл
 * «залипал» в `hidden` навсегда. Общий счётчик решает это: ставим `hidden`
 * при первом маунте, снимаем при последнем анмаунте — независимо от порядка.
 */
let lockCount = 0;
let savedOverflow = "";

export function useBodyScrollLock(): void {
  useEffect(() => {
    if (lockCount === 0) {
      savedOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    lockCount += 1;
    return () => {
      lockCount -= 1;
      if (lockCount === 0) {
        document.body.style.overflow = savedOverflow;
      }
    };
  }, []);
}
