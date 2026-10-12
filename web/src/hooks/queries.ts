import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { SessionState } from "../api/types.js";
import {
  acknowledgeNotification,
  checkSession,
  fetchNotifications,
  fetchOrder,
  fetchOrders,
  fetchPlatforms,
  login,
  logout,
  runOrderAction,
  runSync,
  type OrdersQuery,
} from "../api/client.js";
import type { OrderActionInput } from "../api/types.js";
import { PAGE_SIZE } from "../api/config.js";
import { useTraining } from "../training/context.js";

export function useSession() {
  return useQuery({
    queryKey: ["session"],
    queryFn: checkSession,
    staleTime: 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ username, password }: { username: string; password: string }) => login(username, password),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["session"] }),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: logout,
    onSuccess: () => {
      // Сначала «выключаем» живую сессию — приложение сразу уходит на экран входа.
      // Затем сбрасываем кэш остальных запросов.
      // Важно НЕ вызывать clear(): он уничтожает живой запрос сессии, а
      // последующий setQueryData пишет в новый инстанс, которого уже не видит
      // смонтированный observer — интерфейс остался бы «полуживым» с ошибкой 401.
      qc.setQueryData<SessionState>(["session"], { authorized: false, setupRequired: false, user: null });
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== "session" });
    },
  });
}

export function useOrders(filter: Pick<OrdersQuery, "platform" | "status" | "q">) {
  const training = useTraining();
  const remote = useInfiniteQuery({
    queryKey: ["orders", filter],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => fetchOrders({ ...filter, page: pageParam, limit: PAGE_SIZE }),
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
    // При смене фильтра/поиска показываем прежний список, пока грузится новый:
    // без «мигания» лоадером на каждый запрос.
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    retry: 1,
    refetchOnWindowFocus: false,
    enabled: !training.active,
  });

  // В режиме обучения данные берём из локальной модели — мгновенно, без сети.
  if (training.active) {
    const page = training.getOrders(filter);
    return {
      data: training.loaded ? { pages: [page], pageParams: [1] } : undefined,
      isPending: !training.loaded,
      isError: false,
      error: null,
      isFetching: false,
      refetch: () => {},
      hasNextPage: false,
      fetchNextPage: () => {},
      isFetchingNextPage: false,
    } as unknown as typeof remote;
  }
  return remote;
}

export function useOrder(id: string | null) {
  const training = useTraining();
  const remote = useQuery({
    queryKey: ["order", id],
    queryFn: () => fetchOrder(id as string),
    enabled: Boolean(id) && !training.active,
    staleTime: 15_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  if (training.active) {
    const order = id ? training.getOrder(id) : undefined;
    return {
      data: order ? { order } : undefined,
      isPending: !training.loaded,
      isError: training.loaded && !order,
      error: null,
      refetch: () => {},
    } as unknown as typeof remote;
  }
  return remote;
}

export function useNotifications(enabled = true) {
  const training = useTraining();
  const remote = useQuery({
    queryKey: ["notifications"],
    queryFn: fetchNotifications,
    enabled: enabled && !training.active,
    staleTime: 15_000,
    refetchOnWindowFocus: false,
  });

  if (training.active) {
    return {
      data: { items: training.notifications, unread: training.unread },
      isPending: !training.loaded,
      isError: false,
      error: null,
      refetch: () => {},
    } as unknown as typeof remote;
  }
  return remote;
}

export function usePlatforms() {
  const training = useTraining();
  const remote = useQuery({
    queryKey: ["platforms"],
    queryFn: fetchPlatforms,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    enabled: !training.active,
  });

  if (training.active) {
    return {
      data: { items: training.platforms },
      isPending: !training.loaded,
      isError: false,
      error: null,
      refetch: () => {},
    } as unknown as typeof remote;
  }
  return remote;
}

export function useOrderAction() {
  const qc = useQueryClient();
  const training = useTraining();
  return useMutation({
    mutationFn: (input: OrderActionInput) => (training.active ? training.performAction(input) : runOrderAction(input)),
    onSuccess: (_data, input) => {
      if (training.active) return;
      void qc.invalidateQueries({ queryKey: ["orders"] });
      void qc.invalidateQueries({ queryKey: ["order", input.id] });
      void qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

export function useAckNotification() {
  const qc = useQueryClient();
  const training = useTraining();
  return useMutation({
    mutationFn: (id: string) =>
      training.active ? training.ackNotification(id).then(() => ({ ok: true })) : acknowledgeNotification(id),
    onSuccess: () => {
      if (!training.active) void qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

export function useSync() {
  const qc = useQueryClient();
  const training = useTraining();
  const base = useMutation({
    mutationFn: () => (training.active ? training.performSync() : runSync()),
    onSuccess: () => {
      if (training.active) return;
      void qc.invalidateQueries({ queryKey: ["orders"] });
      void qc.invalidateQueries({ queryKey: ["platforms"] });
      void qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
  // В режиме обучения синхронизацию может запускать и Помощник — показываем
  // её ход даже если кнопку нажал не пользователь.
  return { ...base, isPending: base.isPending || training.syncPending };
}
