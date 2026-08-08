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

  const { groupId, groupName, optionId, optionName, priceDelta } = option;

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

  const id = isString(item.id) ? item.id : String(item.id || '');
  if (!id) return null;

  const price = isFiniteNumber(item.price) ? item.price : 0;
  const basePrice = isFiniteNumber(item.basePrice) ? item.basePrice : price;
  const quantity = (isFiniteNumber(item.quantity) && item.quantity > 0) ? item.quantity : 1;

  const selectedOptions: CartSelectedOption[] = Array.isArray(item.selectedOptions)
    ? item.selectedOptions
        .map(normalizeSelectedOption)
        .filter((opt): opt is CartSelectedOption => opt !== null)
    : [];

  return {
    id,
    lineId: isString(item.lineId) ? item.lineId : id,
    name: isString(item.name) ? item.name : 'Produto',
    description: isString(item.description) ? item.description : '',
    price,
    basePrice,
    image: isString(item.image) ? item.image : '',
    quantity,
    merchantId: isString(item.merchantId) ? item.merchantId : '',
    selectedOptions
  };
};

/**
 * Normaliza um snapshot de endereço.
 */
const normalizeAddressSnapshot = (addr: unknown): LocalAddressSnapshot | null => {
  if (!isRecord(addr)) return null;
  
  // Garantimos apenas os campos mínimos necessários para exibição, mas tentamos preservar a estrutura.
  return {
    id: isString(addr.id) ? addr.id : '',
    user_id: isString(addr.user_id) ? addr.user_id : '',
    label: isString(addr.label) ? addr.label : 'Endereço',
    street: isString(addr.street) ? addr.street : '',
    number: isString(addr.number) ? addr.number : '',
    complement: isString(addr.complement) ? addr.complement : null,
    neighborhood: isString(addr.neighborhood) ? addr.neighborhood : '',
    city: isString(addr.city) ? addr.city : '',
    state: isString(addr.state) ? addr.state : '',
    postal_code: isString(addr.postal_code) ? addr.postal_code : '',
    reference: isString(addr.reference) ? addr.reference : null,
    latitude: isFiniteNumber(addr.latitude) ? addr.latitude : null,
    longitude: isFiniteNumber(addr.longitude) ? addr.longitude : null,
    is_default: !!addr.is_default,
    created_at: isString(addr.created_at) ? addr.created_at : new Date().toISOString(),
    updated_at: isString(addr.updated_at) ? addr.updated_at : new Date().toISOString(),
  };
};

/**
 * Normaliza um pedido completo.
 */
const normalizeLocalOrder = (order: unknown): LocalOrder | null => {
  if (!isRecord(order)) return null;

  const id = isString(order.id) ? order.id : '';
  if (!id) return null;

  const merchant = isRecord(order.merchant) ? order.merchant : null;
  if (!merchant) return null;

  const items = Array.isArray(order.items)
    ? order.items
        .map(normalizeLocalOrderItem)
        .filter((item): item is LocalOrderItem => item !== null)
    : [];

  const address = normalizeAddressSnapshot(order.address);
  if (!address) return null;

  return {
    ...order, // Preserva campos extras
    id,
    createdAt: isString(order.createdAt) ? order.createdAt : new Date().toISOString(),
    merchant: merchant as CartMerchant,
    items,
    subtotal: isFiniteNumber(order.subtotal) ? order.subtotal : 0,
    deliveryFee: isFiniteNumber(order.deliveryFee) ? order.deliveryFee : 0,
    discount: isFiniteNumber(order.discount) ? order.discount : 0,
    total: isFiniteNumber(order.total) ? order.total : 0,
    address,
    paymentMethod: isString(order.paymentMethod) ? order.paymentMethod : 'pix',
    status: isString(order.status) ? order.status : 'confirmado',
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
