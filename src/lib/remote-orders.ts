import { supabase } from "@/integrations/supabase/client";

export type OrderSelectedOption = {
  groupId: string;
  groupName: string;
  optionId: string;
  optionName: string;
  priceDelta: number;
};

export type CustomerOrderItem = {
  id: string;
  product_id: string | null;
  product_name: string;
  product_description: string | null;
  base_price: number;
  unit_price: number;
  quantity: number;
  line_total: number;
  selected_options: OrderSelectedOption[];
};

export type CustomerOrderMerchant = {
  id: string;
  name: string;
  logo_url: string | null;
  address_line?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  delivery_min_minutes: number | null;
  delivery_max_minutes: number | null;
  delivery_fee: number;
};

export type CustomerOrderListItem = {
  id: string;
  order_number: number;
  status: string;
  payment_method: string;
  payment_status: string;
  subtotal: number;
  delivery_fee: number;
  service_fee: number;
  discount: number;
  total: number;
  delivery_address: Record<string, unknown>;
  observation: string | null;
  created_at: string;
  updated_at: string;
  merchants: CustomerOrderMerchant | null;
  order_items: CustomerOrderItem[];
};

export type CustomerOrderHistoryEntry = {
  id: string;
  status: string;
  changed_by_user_id: string | null;
  created_at: string;
};

export type CustomerCourier = {
  id: string;
  user_id: string;
  photo_url: string | null;
  vehicle_type: string | null;
  vehicle_model: string | null;
  vehicle_plate: string | null;
  rating: number;
  review_count: number;
  profile: {
    full_name: string | null;
    phone: string | null;
    avatar_url: string | null;
  } | null;
};

export type CustomerDeliveryDetail = {
  id: string;
  status: string;
  courier_id: string | null;
  pickup_address: Record<string, unknown>;
  delivery_address: Record<string, unknown>;
  pickup_latitude: number | null;
  pickup_longitude: number | null;
  delivery_latitude: number | null;
  delivery_longitude: number | null;
  estimated_distance_meters: number | null;
  estimated_duration_seconds: number | null;
  estimated_earnings: number;
  accepted_at: string | null;
  pickup_arrived_at: string | null;
  picked_up_at: string | null;
  destination_arrived_at: string | null;
  delivered_at: string | null;
  couriers: CustomerCourier | null;
};

export type CustomerOrderDetail = CustomerOrderListItem & {
  platform_fee: number;
  merchant_net: number | null;
  courier_earnings: number | null;
  fulfillment_type: "delivery" | "pickup";
  accepted_at: string | null;
  ready_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  order_status_history: CustomerOrderHistoryEntry[];
  delivery: CustomerDeliveryDetail | null;
  deliveryPin: string | null;
};

type ListResponse = { orders: CustomerOrderListItem[] };
type DetailResponse = { order: CustomerOrderDetail };

type FunctionErrorBody = {
  error?: string;
  code?: string;
};

export class CustomerOrdersError extends Error {
  readonly code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = "CustomerOrdersError";
    this.code = code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeSelectedOptions(value: unknown): OrderSelectedOption[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((option) => {
    if (!isRecord(option)) return [];
    const { groupId, groupName, optionId, optionName, priceDelta } = option;
    if (
      typeof groupId !== "string" ||
      typeof groupName !== "string" ||
      typeof optionId !== "string" ||
      typeof optionName !== "string" ||
      typeof priceDelta !== "number"
    ) {
      return [];
    }
    return [{ groupId, groupName, optionId, optionName, priceDelta }];
  });
}

function normalizeOrderItems(items: CustomerOrderItem[]): CustomerOrderItem[] {
  return items.map((item) => ({
    ...item,
    base_price: Number(item.base_price),
    unit_price: Number(item.unit_price),
    line_total: Number(item.line_total),
    selected_options: normalizeSelectedOptions(item.selected_options),
  }));
}

async function invokeOrders<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>("customer-orders", { body });
  if (error || !data) {
    let message = "Não foi possível carregar seus pedidos.";
    let code: string | undefined;
    const context = error?.context;
    if (context instanceof Response) {
      try {
        const bodyData = (await context.clone().json()) as FunctionErrorBody;
        if (bodyData.error) message = bodyData.error;
        code = bodyData.code;
      } catch {
        // Keep safe fallback message.
      }
    }
    throw new CustomerOrdersError(message, code);
  }
  return data;
}

export async function fetchCustomerOrders(limit = 50): Promise<CustomerOrderListItem[]> {
  const data = await invokeOrders<ListResponse>({ action: "list", limit });
  return data.orders.map((order) => ({
    ...order,
    subtotal: Number(order.subtotal),
    delivery_fee: Number(order.delivery_fee),
    service_fee: Number(order.service_fee),
    discount: Number(order.discount),
    total: Number(order.total),
    order_items: normalizeOrderItems(order.order_items ?? []),
  }));
}

export async function fetchCustomerOrderDetail(orderId: string): Promise<CustomerOrderDetail> {
  const data = await invokeOrders<DetailResponse>({ action: "detail", orderId });
  const order = data.order;
  return {
    ...order,
    subtotal: Number(order.subtotal),
    delivery_fee: Number(order.delivery_fee),
    service_fee: Number(order.service_fee),
    platform_fee: Number(order.platform_fee),
    merchant_net: order.merchant_net === null ? null : Number(order.merchant_net),
    courier_earnings: order.courier_earnings === null ? null : Number(order.courier_earnings),
    discount: Number(order.discount),
    total: Number(order.total),
    order_items: normalizeOrderItems(order.order_items ?? []),
    order_status_history: [...(order.order_status_history ?? [])].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    ),
    delivery: order.delivery
      ? {
          ...order.delivery,
          estimated_earnings: Number(order.delivery.estimated_earnings),
        }
      : null,
  };
}

const STATUS_LABELS: Record<string, string> = {
  created: "Criado",
  pending_payment: "Aguardando pagamento",
  paid: "Pago",
  confirmed: "Confirmado",
  accepted: "Aceito",
  preparing: "Em preparo",
  ready: "Pronto",
  ready_for_pickup: "Pronto para coleta",
  searching_driver: "Buscando entregador",
  driver_assigned: "Entregador a caminho",
  driver_arriving_store: "Entregador chegando ao estabelecimento",
  picked_up: "Pedido coletado",
  out_for_delivery: "Saiu para entrega",
  on_the_way: "A caminho",
  delivered: "Entregue",
  cancelled: "Cancelado",
  refunded: "Reembolsado",
};

export function getOrderStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status.replaceAll("_", " ");
}

export function isOrderActive(status: string): boolean {
  return !["delivered", "cancelled", "refunded"].includes(status);
}

export function formatMoney(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export function formatOrderDate(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
