import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

// Единая база для всего outline-набора: обводка, currentColor, толщина,
// доступность. props разворачиваются последними, чтобы вызывающий мог
// переопределить размер/цвет.
const base: IconProps = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.9,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  focusable: false,
};

/** Грузовик — логотип и статус «в пути». */
export function IconTruck(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3 7h11v9H3z" />
      <path d="M14 10h4l3 3v3h-7" />
      <circle cx="7.5" cy="18" r="1.8" />
      <circle cx="17.5" cy="18" r="1.8" />
    </svg>
  );
}

/** Коробка — показатель «всего заказов». */
export function IconBox(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3 3 7.5v9L12 21l9-4.5v-9z" />
      <path d="m3 7.5 9 4.5 9-4.5M12 12v9" />
    </svg>
  );
}

/** Маршрут/стрелка — направление доставки. */
export function IconArrowRight(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

/** Часы — «в пути». */
export function IconClock(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

/** Тревога — проблемы и отклонения. */
export function IconAlert(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M10.3 3.9 2.5 17.5A1.5 1.5 0 0 0 3.8 20h16.4a1.5 1.5 0 0 0 1.3-2.5L13.7 3.9a1.6 1.6 0 0 0-3.4 0Z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  );
}

/** Звонок — уведомления. */
export function IconBell(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </svg>
  );
}

/** Поиск. */
export function IconSearch(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.2-3.2" />
    </svg>
  );
}

/** Закрыть. */
export function IconClose(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

/** Повторить/обновить. */
export function IconRefresh(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M20 11a8 8 0 1 0-1.5 5" />
      <path d="M20 5v6h-6" />
    </svg>
  );
}

/** Подтвердить (галочка). */
export function IconCheck(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="m4 12 5 5L20 6" />
    </svg>
  );
}

/** Отклонить (крестик в круге). */
export function IconReject(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9 9l6 6M15 9l-6 6" />
    </svg>
  );
}

/** Изменить (карандаш). */
export function IconEdit(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 20h4L19 9l-4-4L4 16z" />
      <path d="m14 6 4 4" />
    </svg>
  );
}

/** Загрузить документ. */
export function IconUpload(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 16V4M7 9l5-5 5 5" />
      <path d="M5 20h14" />
    </svg>
  );
}

/** Документ. */
export function IconDoc(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M6 2h8l4 4v16H6z" />
      <path d="M14 2v4h4M9 13h6M9 17h6" />
    </svg>
  );
}

/** Выход. */
export function IconLogout(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
      <path d="M10 12H3M7 8l-4 4 4 4" />
    </svg>
  );
}

/** Солнце — переключение на светлую тему. */
export function IconSun(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

/** Луна — переключение на тёмную тему. */
export function IconMoon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />
    </svg>
  );
}

/** Обмен/синхронизация с площадками. */
export function IconSync(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 8h13l-3-3M20 16H7l3 3" />
    </svg>
  );
}

/** Площадка/сеть. */
export function IconLayers(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="m12 3 9 5-9 5-9-5z" />
      <path d="m3 13 9 5 9-5" />
    </svg>
  );
}

/** Пусто (лупа в рамке). */
export function IconInbox(props: IconProps) {
  return (
    <svg {...base} {...props} width={36} height={36}>
      <path d="M3 13h5l2 3h4l2-3h5" />
      <path d="M5 5h14l2 8v4a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-4z" />
    </svg>
  );
}

/** Искры — Помощник и обучение. */
export function IconSpark(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M11 3.5 12.6 8l4.4 1.6L12.6 11 11 15.5 9.4 11 5 9.6 9.4 8z" />
      <path d="M18 14.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />
    </svg>
  );
}

/** Нет связи (offline). */
export function IconWifiOff(props: IconProps) {
  return (
    <svg {...base} {...props} width={36} height={36}>
      <path d="M2 8a15 15 0 0 1 6-3M14 5.2a15 15 0 0 1 8 3M5 12a10 10 0 0 1 3-1.6M16 10.4a10 10 0 0 1 3 1.6M8.5 15.5a5 5 0 0 1 7 0" />
      <path d="M12 19h.01M3 3l18 18" />
    </svg>
  );
}
