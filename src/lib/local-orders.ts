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

export interface LocalOrderItem extends Omit<CartItem, 'id'> {
  id: string;
  lineId: string;
  basePrice: number;
  selectedOptions: CartSelectedOption[];
}

export interface LocalOrder {
  id: string;
  createdAt: string;
  merchant: CartMerchant;
  items: LocalOrderItem[];
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
  address: LocalAddressSnapshot;
  paymentMethod: string;
  observation?: string;
  status: string;
  rating?: {
    merchant: number;
    delivery: number;
    comment?: string;
  };
}

// Auxiliares de validação de tipo
const isRecord = (value: unknown): value is Record<string, unknown> => 
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isString = (value: unknown): value is string => typeof value === 'string';

const isFiniteNumber = (value: unknown): value is number => 
  typeof value === 'number' && Number.isFinite(value);

/**
 * Normaliza uma opção selecionada, garantindo que todos os campos obrigatórios existam.
 */
const normalizeSelectedOption = (option: unknown): CartSelectedOption | null => {
  if (!isRecord(option)) return null;

  const groupId = option['groupId'];
  const groupName = option['groupName'];
  const optionId = option['optionId'];
  const optionName = option['optionName'];
  const priceDelta = option['priceDelta'];

  if (
    isString(groupId) && groupId.trim() !== "" &&
    isString(groupName) && groupName.trim() !== "" &&
    isString(optionId) && optionId.trim() !== "" &&
    isString(optionName) && optionName.trim() !== "" &&
    isFiniteNumber(priceDelta)
  ) {
    return {
      groupId,
      groupName,
      optionId,
      optionName,
      priceDelta
    };
  }

  return null;
};

/**
 * Normaliza um item de pedido recuperado do localStorage para garantir
 * compatibilidade com versões anteriores e snapshots íntegros.
 */
export const normalizeLocalOrderItem = (item: unknown): LocalOrderItem | null => {
  if (!isRecord(item)) return null;

  const rawId = item['id'];
  const id = isString(rawId) ? rawId : (rawId !== undefined && rawId !== null ? String(rawId) : '');
  if (!id) return null;

  const price = isFiniteNumber(item['price']) ? item['price'] : 0;
  const basePrice = isFiniteNumber(item['basePrice']) ? item['basePrice'] : price;
  const quantity = (isFiniteNumber(item['quantity']) && (item['quantity'] as number) > 0) ? item['quantity'] : 1;

  const selectedOptions: CartSelectedOption[] = Array.isArray(item['selectedOptions'])
    ? (item['selectedOptions'] as unknown[])
        .map(normalizeSelectedOption)
        .filter((opt): opt is CartSelectedOption => opt !== null)
    : [];

  const rawLineId = item['lineId'];
  const rawName = item['name'];
  const rawDesc = item['description'];
  const rawImage = item['image'];
  const rawMerchantId = item['merchantId'];

  return {
    id,
    lineId: isString(rawLineId) ? rawLineId : id,
    name: isString(rawName) ? rawName : 'Produto',
    description: isString(rawDesc) ? rawDesc : '',
    price,
    basePrice,
    image: isString(rawImage) ? rawImage : '',
    quantity: quantity as number,
    merchantId: isString(rawMerchantId) ? rawMerchantId : '',
    selectedOptions
  };
};

/**
 * Normaliza um snapshot de endereço.
 */
const normalizeAddressSnapshot = (addr: unknown): LocalAddressSnapshot | null => {
  if (!isRecord(addr)) return null;
  
  const id = addr['id'];
  const user_id = addr['user_id'];
  const label = addr['label'];
  const street = addr['street'];
  const number = addr['number'];
  const complement = addr['complement'];
  const neighborhood = addr['neighborhood'];
  const city = addr['city'];
  const state = addr['state'];
  const postal_code = addr['postal_code'];
  const reference = addr['reference'];
  const latitude = addr['latitude'];
  const longitude = addr['longitude'];
  const is_default = addr['is_default'];
  const created_at = addr['created_at'];
  const updated_at = addr['updated_at'];

  return {
    id: isString(id) ? id : '',
    user_id: isString(user_id) ? user_id : '',
    label: isString(label) ? label : 'Endereço',
    street: isString(street) ? street : '',
    number: isString(number) ? number : '',
    complement: isString(complement) ? complement : null,
    neighborhood: isString(neighborhood) ? neighborhood : '',
    city: isString(city) ? city : '',
    state: isString(state) ? state : '',
    postal_code: isString(postal_code) ? postal_code : '',
    reference: isString(reference) ? reference : null,
    latitude: isFiniteNumber(latitude) ? latitude : null,
    longitude: isFiniteNumber(longitude) ? longitude : null,
    is_default: !!is_default,
    created_at: isString(created_at) ? created_at : new Date().toISOString(),
    updated_at: isString(updated_at) ? updated_at : new Date().toISOString(),
  };
};

/**
 * Normaliza um pedido completo.
 */
const normalizeLocalOrder = (order: unknown): LocalOrder | null => {
  if (!isRecord(order)) return null;

  const rawId = order['id'];
  const id = isString(rawId) ? rawId : '';
  if (!id) return null;

  const merchant = order['merchant'];
  if (!isRecord(merchant)) return null;

  const items = Array.isArray(order['items'])
    ? (order['items'] as unknown[])
        .map(normalizeLocalOrderItem)
        .filter((item): item is LocalOrderItem => item !== null)
    : [];

  const address = normalizeAddressSnapshot(order['address']);
  if (!address) return null;

  const createdAt = order['createdAt'];
  const subtotal = order['subtotal'];
  const deliveryFee = order['deliveryFee'];
  const discount = order['discount'];
  const total = order['total'];
  const paymentMethod = order['paymentMethod'];
  const status = order['status'];

  return {
    ...order, // Preserva campos extras
    id,
    createdAt: isString(createdAt) ? createdAt : new Date().toISOString(),
    merchant: merchant as unknown as CartMerchant,
    items,
    subtotal: isFiniteNumber(subtotal) ? subtotal : 0,
    deliveryFee: isFiniteNumber(deliveryFee) ? deliveryFee : 0,
    discount: isFiniteNumber(discount) ? discount : 0,
    total: isFiniteNumber(total) ? total : 0,
    address,
    paymentMethod: isString(paymentMethod) ? paymentMethod : 'pix',
    status: isString(status) ? status : 'confirmado',
  } as LocalOrder;
};

/**
 * Recupera e normaliza a lista de pedidos de um usuário.
 */
export const getLocalOrders = (userId: string): LocalOrder[] => {
  const ordersKey = `apois_orders_${userId}`;
  try {
    const stored = localStorage.getItem(ordersKey);
    if (!stored) return [];
    
    const rawOrders = JSON.parse(stored);
    if (!Array.isArray(rawOrders)) return [];

    return rawOrders
      .map(normalizeLocalOrder)
      .filter((order): order is LocalOrder => order !== null);
  } catch (e) {
    console.error("Erro ao ler pedidos locais:", e);
    return [];
  }
};

/**
 * Recupera um pedido específico por ID.
 */
export const getLocalOrderById = (userId: string, orderId: string): LocalOrder | null => {
  const orders = getLocalOrders(userId);
  return orders.find(o => o.id === orderId) || null;
};

/**
 * Salva ou atualiza a lista de pedidos.
 */
export const saveLocalOrders = (userId: string, orders: LocalOrder[]): void => {
  const ordersKey = `apois_orders_${userId}`;
  localStorage.setItem(ordersKey, JSON.stringify(orders));
};
