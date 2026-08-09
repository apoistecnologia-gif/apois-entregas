export const TERMINAL_ORDER_STATUSES = new Set(["delivered", "cancelled", "refunded"]);

export function isTerminalOrderStatus(status: string) {
  return TERMINAL_ORDER_STATUSES.has(status);
}

export function customerCanCancel(status: string) {
  return ["created", "pending_payment", "paid", "confirmed"].includes(status);
}

export function merchantNextStatuses(status: string): string[] {
  if (status === "confirmed") return ["accepted", "preparing"];
  if (status === "accepted") return ["preparing"];
  if (status === "preparing") return ["ready"];
  return [];
}

export function courierNextStatus(status: string): string | null {
  const transitions: Record<string, string> = {
    accepted: "arriving_pickup",
    arriving_pickup: "at_pickup",
    at_pickup: "picked_up",
    picked_up: "on_the_way",
    on_the_way: "arrived_destination",
  };
  return transitions[status] ?? null;
}

export function paymentAllowsFulfillment(paymentStatus: string) {
  return paymentStatus === "paid";
}
