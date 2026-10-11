import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
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
    onSuccess: () => qc.clear(),
  });
}

export function useOrders(filter: Pick<OrdersQuery, "platform" | "status" | "q">) {
  return useInfiniteQuery({
    queryKey: ["orders", filter],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => fetchOrders({ ...filter, page: pageParam, limit: PAGE_SIZE }),
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
    staleTime: 30_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });
}

export function useOrder(id: string | null) {
  return useQuery({
    queryKey: ["order", id],
    queryFn: () => fetchOrder(id as string),
    enabled: Boolean(id),
    staleTime: 15_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });
}

export function useNotifications(enabled = true) {
  return useQuery({
    queryKey: ["notifications"],
    queryFn: fetchNotifications,
    enabled,
    staleTime: 15_000,
    refetchOnWindowFocus: false,
  });
}

export function usePlatforms() {
  return useQuery({
    queryKey: ["platforms"],
    queryFn: fetchPlatforms,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

export function useOrderAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: OrderActionInput) => runOrderAction(input),
    onSuccess: (_data, input) => {
      void qc.invalidateQueries({ queryKey: ["orders"] });
      void qc.invalidateQueries({ queryKey: ["order", input.id] });
      void qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

export function useAckNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => acknowledgeNotification(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

export function useSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: runSync,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["orders"] });
      void qc.invalidateQueries({ queryKey: ["platforms"] });
      void qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}
