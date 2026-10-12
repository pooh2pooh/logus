import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  NotificationItem,
  Order,
  OrderActionInput,
  OrderActionResult,
  OrdersPage,
  OrderSummary,
  Platform,
  SyncResult,
} from "../api/types.js";
import { ApiError, fetchTraining } from "../api/client.js";
import { orderNum } from "../format.js";
import { useAppUi } from "../hooks/useAppUi.js";
import {
  applyAction,
  applyPatches,
  clearState,
  emptyState,
  loadState,
  mergePatch,
  notificationsOf,
  platformsOf,
  saveState,
  summaryOf,
  TRAINING_RESET_MS,
  type TrainingState,
} from "./store.js";
import { describePrepare, isFinished, STEPS, type PrepareAction, type Step, type StepEval } from "./scenario.js";

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

export interface OrdersFilter {
  platform?: string;
  status?: string;
  q?: string;
}

/** Строка «чата» Помощника: пройденный или текущий шаг. */
export interface TranscriptItem {
  id: string;
  title: string;
  say: string;
  action: string;
  state: "done" | "current";
}

interface TrainingApi {
  /** Лента шагов: все пройденные + текущий (как чат). */
  transcript: TranscriptItem[];
  /** Помощник сейчас сам выполняет подготовку шага. */
  preparing: boolean;
  /** Подготовка закончена — ждём действия пользователя. */
  waiting: boolean;

  /** Канонический набор загружен. */
  loaded: boolean;
  /** Режим обучения включён (данные кабинета — учебные). */
  active: boolean;
  panelOpen: boolean;
  openPanel: () => void;
  closePanel: () => void;
  start: () => void;
  exit: () => void;
  resetNow: () => void;
  restart: () => void;
  replay: () => void;
  hasProgress: boolean;

  finished: boolean;
  step: Step | null;
  stepNumber: number;
  totalSteps: number;
  progress: number;
  target: string | null;
  say: string;
  action: string;
  statusLine: string;
  hint: string | null;
  celebrate: boolean;
  completionLeftMs: number | null;

  orders: Order[];
  summary: OrderSummary;
  notifications: NotificationItem[];
  unread: number;
  platforms: Platform[];
  syncPending: boolean;

  getOrders: (filter: OrdersFilter) => OrdersPage;
  getOrder: (id: string) => Order | undefined;
  performAction: (input: OrderActionInput) => Promise<OrderActionResult>;
  ackNotification: (id: string) => Promise<void>;
  performSync: () => Promise<SyncResult>;
}

const Ctx = createContext<TrainingApi | null>(null);

function searchable(order: Order): string {
  return [
    orderNum(order),
    order.route.from.city,
    order.route.to.city,
    order.route.from.address,
    order.route.to.address,
    order.cargo.name,
    order.counterparty.carrierName,
  ]
    .join(" ")
    .toLowerCase();
}

function filterOrders(orders: Order[], filter: OrdersFilter): Order[] {
  const platform = filter.platform ?? "";
  const status = filter.status ?? "";
  const q = (filter.q ?? "").trim().toLowerCase();
  return orders.filter((order) => {
    if (platform !== "" && order.source !== platform) return false;
    if (status !== "" && order.status !== status) return false;
    if (q !== "" && !searchable(order).includes(q)) return false;
    return true;
  });
}

export function TrainingProvider({ children }: { children: ReactNode }) {
  const ui = useAppUi();

  const query = useQuery({ queryKey: ["training"], queryFn: fetchTraining, staleTime: Infinity, retry: 1, refetchOnWindowFocus: false });
  const canonical = useMemo<Order[]>(() => query.data?.items ?? [], [query.data]);

  const [state, setState] = useState<TrainingState>(() => loadState());
  const [active, setActive] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [statusLine, setStatusLine] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [syncPending, setSyncPending] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [replayToken, setReplayToken] = useState(0);

  const stateRef = useRef(state);
  const ordersRef = useRef<Order[]>([]);
  const preparedRef = useRef<string | null>(null);
  const runPrepareRef = useRef<(action: PrepareAction) => void>(() => {});
  // Стабильная ссылка на закрытие окон: колбэки выхода не должны
  // пересоздаваться при каждом изменении вида кабинета.
  const closeDialogsRef = useRef(ui.closeDialogs);
  closeDialogsRef.current = ui.closeDialogs;

  useEffect(() => {
    stateRef.current = state;
    saveState(state);
  }, [state]);

  const orders = useMemo(() => applyPatches(canonical, state.patches), [canonical, state.patches]);
  useEffect(() => {
    ordersRef.current = orders;
  }, [orders]);

  const summary = useMemo<OrderSummary>(() => summaryOf(orders), [orders]);
  const notifications = useMemo<NotificationItem[]>(() => notificationsOf(orders, state.read), [orders, state.read]);
  const unread = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);
  const platforms = useMemo<Platform[]>(() => platformsOf(orders, state.lastSync), [orders, state.lastSync]);

  const finished = isFinished(state.stepIndex);
  const step = finished ? null : (STEPS[state.stepIndex] ?? null);

  const ctx = useMemo<StepEval>(
    () => ({ orders, patches: state.patches, flags: state.flags, status: ui.status, summary }),
    [orders, state.patches, state.flags, ui.status, summary],
  );
  const ctxRef = useRef(ctx);
  useEffect(() => {
    ctxRef.current = ctx;
  }, [ctx]);

  // Лента чата: пройденные шаги + текущий. Будущие не показываем.
  const transcript = useMemo<TranscriptItem[]>(() => {
    const items: TranscriptItem[] = [];
    STEPS.forEach((s, index) => {
      const isDone = index < state.stepIndex || state.done.includes(s.id);
      const isCurrent = index === state.stepIndex && !finished;
      if (!isDone && !isCurrent) return;
      items.push({
        id: s.id,
        title: s.title,
        say: s.say(ctx),
        action: s.do?.(ctx) ?? "",
        state: isCurrent ? "current" : "done",
      });
    });
    return items;
  }, [ctx, state.stepIndex, state.done, finished]);

  // Ждём действия пользователя: шаг открыт, подготовка завершена, не празднуем.
  const waiting = active && !finished && !preparing && !celebrate;

  const setFlag = useCallback((name: string, value = true) => {
    setState((s) => (s.flags[name] === value ? s : { ...s, flags: { ...s.flags, [name]: value } }));
  }, []);

  const performSync = useCallback(async (): Promise<SyncResult> => {
    setSyncPending(true);
    try {
      await sleep(750);
    } finally {
      setSyncPending(false);
    }
    const syncedAt = new Date().toISOString();
    setState((s) => ({ ...s, lastSync: syncedAt, flags: { ...s.flags, synced: true } }));
    return { ok: true, syncedAt, platforms: platformsOf(ordersRef.current, syncedAt) };
  }, []);

  const runPrepare = useCallback(
    (action: PrepareAction) => {
      switch (action.type) {
        case "openPlatforms":
          ui.setOrderId(null);
          ui.setShowNotifications(false);
          ui.setShowPlatforms(true);
          setFlag("platformsOpened");
          break;
        case "openNotifications":
          setFlag("notificationsOpened");
          ui.setShowNotifications(true);
          break;
        case "closeDialogs":
          ui.closeDialogs();
          break;
        case "setStatus":
          ui.setStatus(action.value);
          break;
        case "openOrder":
          ui.setOrderId(action.id);
          break;
        case "sync":
          void performSync();
          break;
      }
    },
    [ui, setFlag, performSync],
  );
  useEffect(() => {
    runPrepareRef.current = runPrepare;
  }, [runPrepare]);

  // Шаг меняется: Помощник рассказывает и «руками» выполняет подготовку.
  useEffect(() => {
    if (!active || finished) return;
    const currentStep = STEPS[state.stepIndex];
    if (!currentStep || preparedRef.current === currentStep.id) return;
    preparedRef.current = currentStep.id;
    setHint(null);
    setPreparing(true);
    let cancelled = false;
    const run = async () => {
      setStatusLine(currentStep.say(ctxRef.current));
      await sleep(700);
      for (const action of currentStep.prepare ?? []) {
        if (cancelled) return;
        setStatusLine(describePrepare(action));
        await sleep(550);
        if (cancelled) return;
        runPrepareRef.current(action);
        await sleep(650);
      }
      if (cancelled) return;
      setStatusLine(currentStep.do?.(ctxRef.current) ?? currentStep.say(ctxRef.current));
      setPreparing(false);
    };
    void run();
    return () => {
      cancelled = true;
      setPreparing(false);
    };
  }, [active, finished, state.stepIndex, replayToken]);

  // Шаг выполнен — радостно отмечаем и переходим к следующему.
  useEffect(() => {
    if (!active || finished) return;
    const currentStep = STEPS[state.stepIndex];
    if (!currentStep || !currentStep.done(ctx)) return;
    setCelebrate(true);
    setStatusLine("Отлично! Идём дальше.");
    const stepIndex = state.stepIndex;
    const timer = window.setTimeout(() => {
      setCelebrate(false);
      setState((prev) => {
        if (prev.stepIndex !== stepIndex) return prev;
        const nextIndex = Math.min(prev.stepIndex + 1, STEPS.length);
        const done = prev.done.includes(currentStep.id) ? prev.done : [...prev.done, currentStep.id];
        const next: TrainingState = { ...prev, stepIndex: nextIndex, done };
        if (isFinished(nextIndex) && prev.completedAt === null) next.completedAt = Date.now();
        return next;
      });
    }, 1100);
    return () => window.clearTimeout(timer);
  }, [active, finished, state.stepIndex, ctx]);

  const performAction = useCallback(async (input: OrderActionInput): Promise<OrderActionResult> => {
    const order = ordersRef.current.find((o) => o.id === input.id);
    if (!order) throw new ApiError(404, "ORDER_NOT_FOUND", "Заказ не найден");
    const outcome = applyAction(order, input, Date.now());
    if (!outcome.ok || !outcome.patch) {
      const message = outcome.hint ?? "Это действие сейчас недоступно";
      setHint(message);
      setStatusLine(message);
      throw new ApiError(409, "BAD_STATE", message);
    }
    setHint(null);
    const patch = outcome.patch;
    const merged = mergePatch(stateRef.current.patches[input.id], patch);
    setState((s) => ({ ...s, patches: { ...s.patches, [input.id]: merged } }));
    const updated = applyPatches([order], { [input.id]: merged })[0] ?? order;
    return { ok: true, order: updated };
  }, []);

  const ackNotification = useCallback(async (id: string): Promise<void> => {
    setState((s) => ({ ...s, read: { ...s.read, [id]: true }, flags: { ...s.flags, notificationsAcked: true } }));
  }, []);

  const getOrders = useCallback((filter: OrdersFilter): OrdersPage => {
    const items = filterOrders(ordersRef.current, filter);
    return {
      items,
      page: 1,
      limit: Math.max(items.length, 1),
      total: items.length,
      hasMore: false,
      summary: summaryOf(ordersRef.current),
    };
  }, []);

  const getOrder = useCallback((id: string): Order | undefined => ordersRef.current.find((o) => o.id === id), []);

  const openPanel = useCallback(() => setPanelOpen(true), []);
  const closePanel = useCallback(() => setPanelOpen(false), []);
  const start = useCallback(() => {
    setPanelOpen(true);
    setActive(true);
    setHint(null);
    // На повторном входе снова проигрываем подготовку текущего шага,
    // чтобы Помощник заново показал нужные окна.
    preparedRef.current = null;
  }, []);
  const exit = useCallback(() => {
    // Выключаем обучение, закрываем все окна Помощника и сбрасываем
    // транзиентные подсказки — кабинет возвращается в чистое состояние.
    setActive(false);
    setPanelOpen(false);
    setCelebrate(false);
    setStatusLine("");
    setHint(null);
    closeDialogsRef.current();
  }, []);

  const resetNow = useCallback(() => {
    clearState();
    setState(emptyState());
    setActive(false);
    setPanelOpen(false);
    preparedRef.current = null;
    setCelebrate(false);
    setStatusLine("");
    setHint(null);
    closeDialogsRef.current();
  }, []);

  const restart = useCallback(() => {
    clearState();
    setState(emptyState());
    preparedRef.current = null;
    setCelebrate(false);
    setStatusLine("");
    setHint(null);
    closeDialogsRef.current();
    setActive(true);
    setPanelOpen(true);
  }, []);

  const replay = useCallback(() => {
    preparedRef.current = null;
    setReplayToken((t) => t + 1);
  }, []);

  // Обратный отсчёт до обнуления прохождения (15 минут после завершения).
  useEffect(() => {
    if (state.completedAt === null) return;
    const timer = window.setInterval(() => {
      const now = Date.now();
      setNowTick(now);
      if (now - (stateRef.current.completedAt ?? 0) > TRAINING_RESET_MS) resetNow();
    }, 1000);
    return () => window.clearInterval(timer);
  }, [state.completedAt, resetNow]);

  const completionLeftMs =
    state.completedAt === null ? null : Math.max(0, TRAINING_RESET_MS - (nowTick - state.completedAt));

  const value = useMemo<TrainingApi>(
    () => ({
      loaded: query.data !== undefined,
      active,
      panelOpen,
      openPanel,
      closePanel,
      start,
      exit,
      resetNow,
      restart,
      replay,
      hasProgress: state.stepIndex > 0 || state.done.length > 0,
      finished,
      step,
      stepNumber: finished ? STEPS.length : state.stepIndex + 1,
      totalSteps: STEPS.length,
      progress: STEPS.length === 0 ? 1 : Math.min(state.stepIndex / STEPS.length, 1),
      target: step?.target ?? null,
      say: step?.say(ctx) ?? "",
      action: step?.do?.(ctx) ?? "",
      statusLine,
      hint,
      celebrate,
      completionLeftMs,
      transcript,
      preparing,
      waiting,
      orders,
      summary,
      notifications,
      unread,
      platforms,
      getOrders,
      getOrder,
      performAction,
      ackNotification,
      performSync,
      syncPending,
    }),
    [
      query.data,
      active,
      panelOpen,
      openPanel,
      closePanel,
      start,
      exit,
      resetNow,
      restart,
      finished,
      step,
      state.stepIndex,
      state.done,
      state.read,
      ctx,
      statusLine,
      hint,
      celebrate,
      completionLeftMs,
      transcript,
      preparing,
      waiting,
      orders,
      summary,
      notifications,
      unread,
      platforms,
      getOrders,
      getOrder,
      performAction,
      ackNotification,
      performSync,
      syncPending,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTraining(): TrainingApi {
  const value = useContext(Ctx);
  if (!value) throw new Error("useTraining должен вызываться внутри TrainingProvider");
  return value;
}
