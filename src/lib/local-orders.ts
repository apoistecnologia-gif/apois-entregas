import { CartItem, CartMerchant, CartSelectedOption } from "@/contexts/CartContext";

/**
 * Snapshot de endereço para persistência no pedido local.
 */
export interface LocalAddressSnapshot {
  id: string;
  user_id: string;
  label: string;
  street: string;
  number: string;
  complement: string | null;
  neighborhood: string;
  city: string;
  state: string;
  postal_code: string;
  reference: string | null;
  latitude: number | null;
  longitude: number | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface LocalOrderItem extends Omit<CartItem, "id"> {
  id: string;
  lineId: string;
  basePrice: number;
  selectedOptions: CartSelectedOption[];
}

export interface LocalOrder {
  id: string;
  orderNumber?: number;
  createdAt: string;
  merchant: CartMerchant;
  items: LocalOrderItem[];
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
  address: LocalAddressSnapshot;
  paymentMethod: string;
  paymentStatus?: string;
  observation?: string;
  status: string;
  backendStatus?: string;
  rating?: {
    merchant: number;
    delivery: number;
    comment?: string;
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isString = (value: unknown): value is string => typeof value === "string";

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const normalizeSelectedOption = (option: unknown): CartSelectedOption | null => {
  if (!isRecord(option)) return null;

  const groupId = option["groupId"];
  const groupName = option["groupName"];
  const optionId = option["optionId"];
  const optionName = option["optionName"];
  const priceDelta = option["priceDelta"];

  if (
    isString(groupId) && groupId.trim() !== "" &&
    isString(groupName) && groupName.trim() !== "" &&
    isString(optionId) && optionId.trim() !== "" &&
    isString(optionName) && optionName.trim() !== "" &&
    isFiniteNumber(priceDelta)
  ) {
    return { groupId, groupName, optionId, optionName, priceDelta };
  }

  return null;
};

export const normalizeLocalOrderItem = (item: unknown): LocalOrderItem | null => {
  if (!isRecord(item)) return null;

  const rawId = item["id"];
  const id = isString(rawId) ? rawId : rawId !== undefined && rawId !== null ? String(rawId) : "";
  if (!id) return null;

  const price = isFiniteNumber(item["price"]) ? item["price"] : 0;
  const basePrice = isFiniteNumber(item["basePrice"]) ? item["basePrice"] : price;
  const quantity = isFiniteNumber(item["quantity"]) && item["quantity"] > 0 ? item["quantity"] : 1;

  const selectedOptions: CartSelectedOption[] = Array.isArray(item["selectedOptions"])
    ? (item["selectedOptions"] as unknown[])
        .map(normalizeSelectedOption)
        .filter((option): option is CartSelectedOption => option !== null)
    : [];

  const rawLineId = item["lineId"];
  const rawName = item["name"];
  const rawDescription = item["description"];
  const rawImage = item["image"];
  const rawMerchantId = item["merchantId"];

  return {
    id,
    lineId: isString(rawLineId) ? rawLineId : id,
    name: isString(rawName) ? rawName : "Produto",
    description: isString(rawDescription) ? rawDescription : "",
    price,
    basePrice,
    image: isString(rawImage) ? rawImage : "",
    quantity,
    merchantId: isString(rawMerchantId) ? rawMerchantId : "",
    selectedOptions,
  };
};

const normalizeAddressSnapshot = (address: unknown): LocalAddressSnapshot | null => {
  if (!isRecord(address)) return null;

  return {
    id: isString(address["id"]) ? address["id"] : "",
    user_id: isString(address["user_id"]) ? address["user_id"] : "",
    label: isString(address["label"]) ? address["label"] : "Endereço",
    street: isString(address["street"]) ? address["street"] : "",
    number: isString(address["number"]) ? address["number"] : "",
    complement: isString(address["complement"]) ? address["complement"] : null,
    neighborhood: isString(address["neighborhood"]) ? address["neighborhood"] : "",
    city: isString(address["city"]) ? address["city"] : "",
    state: isString(address["state"]) ? address["state"] : "",
    postal_code: isString(address["postal_code"]) ? address["postal_code"] : "",
    reference: isString(address["reference"]) ? address["reference"] : null,
    latitude: isFiniteNumber(address["latitude"]) ? address["latitude"] : null,
    longitude: isFiniteNumber(address["longitude"]) ? address["longitude"] : null,
    is_default: Boolean(address["is_default"]),
    created_at: isString(address["created_at"]) ? address["created_at"] : new Date().toISOString(),
    updated_at: isString(address["updated_at"]) ? address["updated_at"] : new Date().toISOString(),
  };
};

const normalizeLocalOrder = (order: unknown): LocalOrder | null => {
  if (!isRecord(order)) return null;

  const id = isString(order["id"]) ? order["id"] : "";
  if (!id) return null;

  const merchant = order["merchant"];
  if (!isRecord(merchant)) return null;

  const items = Array.isArray(order["items"])
    ? (order["items"] as unknown[])
        .map(normalizeLocalOrderItem)
        .filter((item): item is LocalOrderItem => item !== null)
    : [];

  const address = normalizeAddressSnapshot(order["address"]);
  if (!address) return null;

  return {
    ...order,
    id,
    orderNumber: isFiniteNumber(order["orderNumber"]) ? order["orderNumber"] : undefined,
    createdAt: isString(order["createdAt"]) ? order["createdAt"] : new Date().toISOString(),
    merchant: merchant as unknown as CartMerchant,
    items,
    subtotal: isFiniteNumber(order["subtotal"]) ? order["subtotal"] : 0,
    deliveryFee: isFiniteNumber(order["deliveryFee"]) ? order["deliveryFee"] : 0,
    discount: isFiniteNumber(order["discount"]) ? order["discount"] : 0,
    total: isFiniteNumber(order["total"]) ? order["total"] : 0,
    address,
    paymentMethod: isString(order["paymentMethod"]) ? order["paymentMethod"] : "pix",
    paymentStatus: isString(order["paymentStatus"]) ? order["paymentStatus"] : undefined,
    observation: isString(order["observation"]) ? order["observation"] : undefined,
    status: isString(order["status"]) ? order["status"] : "confirmado",
    backendStatus: isString(order["backendStatus"]) ? order["backendStatus"] : undefined,
  } as LocalOrder;
};

export const getLocalOrders = (userId: string): LocalOrder[] => {
  const ordersKey = `apois_orders_${userId}`;
  try {
    const stored = localStorage.getItem(ordersKey);
    if (!stored) return [];

    const rawOrders: unknown = JSON.parse(stored);
    if (!Array.isArray(rawOrders)) return [];

    return rawOrders
      .map(normalizeLocalOrder)
      .filter((order): order is LocalOrder => order !== null);
  } catch (error) {
    console.error("Erro ao ler pedidos locais:", error);
    return [];
  }
};

export const getLocalOrderById = (userId: string, orderId: string): LocalOrder | null => {
  const orders = getLocalOrders(userId);
  return orders.find((order) => order.id === orderId) || null;
};

export const saveLocalOrders = (userId: string, orders: LocalOrder[]): void => {
  const ordersKey = `apois_orders_${userId}`;
  localStorage.setItem(ordersKey, JSON.stringify(orders));
};
