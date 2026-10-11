export type PlatformCode = "ati" | "loginet" | "own";

export type OrderStatus =
  | "created"
  | "carrier_assigned"
  | "confirmed"
  | "loading"
  | "in_transit"
  | "unloading"
  | "delivered"
  | "closed"
  | "cancelled"
  | "problem";

export interface OrderEvent {
  code: string;
  label: string;
  at: string;
  note: string | null;
}

export interface OrderDoc {
  id: string;
  title: string;
  status: "ok" | "wait";
  url: string | null;
}

export interface OrderDeviation {
  kind: string;
  reason: string;
  minutes: number;
}

export interface Order {
  id: string;
  source: PlatformCode;
  sourceTitle: string;
  sourceOrderId: string;
  status: OrderStatus;
  createdAt: string;
  statusUpdatedAt: string;
  route: {
    from: { city: string; address: string };
    to: { city: string; address: string };
  };
  cargo: {
    name: string;
    weightKg: number;
    volumeM3: number;
    places: number;
    bodyType: string;
  };
  dates: {
    loadAt: string;
    unloadAt: string;
    eta: string | null;
  };
  price: { amount: number; currency: string; vat: string };
  counterparty: {
    carrierName: string;
    carrierContact: string;
    carrierRating: number;
  };
  events: OrderEvent[];
  docs: OrderDoc[];
  flags: {
    deviation: OrderDeviation | null;
    problem: string | null;
  };
}

export interface OrderSummary {
  total: number;
  inTransit: number;
  problems: number;
  delivered: number;
  awaiting: number;
}

export interface OrdersPage {
  items: Order[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
  summary: OrderSummary;
}

export interface Platform {
  code: PlatformCode | string;
  title: string;
  count: number;
  connected: boolean;
  lastSync: string | null;
}

export interface SessionState {
  authorized: boolean;
  setupRequired: boolean;
  user: string | null;
}

export interface AuthResult {
  authorized: boolean;
  user?: string;
}

export interface NotificationItem {
  id: string;
  orderId: string;
  orderNum: string;
  title: string;
  body: string;
  at: string;
  tone: "info" | "ok" | "warn" | "danger";
  read: boolean;
}

export interface NotificationsResult {
  items: NotificationItem[];
  unread: number;
}

export interface SyncResult {
  ok: boolean;
  syncedAt: string;
  platforms: Platform[];
}

export type OrderActionName =
  | "confirm"
  | "reject"
  | "request_change"
  | "report_problem"
  | "resolve_problem"
  | "mark_received"
  | "upload_doc";

export interface OrderActionInput {
  id: string;
  action: OrderActionName;
  note?: string;
  docType?: string;
}

export interface OrderActionResult {
  ok: boolean;
  order: Order | null;
}
