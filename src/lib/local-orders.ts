import { CartItem, CartMerchant, CartSelectedOption } from "@/contexts/CartContext";

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
  address: any;
  paymentMethod: string;
  observation?: string;
  status: string;
  rating?: {
    merchant: number;
    delivery: number;
    comment?: string;
  };
}

/**
 * Normaliza um item de pedido recuperado do localStorage para garantir
 * compatibilidade com versões anteriores e snapshots íntegros.
 */
export const normalizeLocalOrderItem = (item: any): LocalOrderItem => {
  return {
    ...item,
    id: item.id,
    lineId: item.lineId || item.id,
    name: item.name || 'Produto',
    description: item.description || '',
    price: item.price || 0,
    basePrice: item.basePrice !== undefined ? item.basePrice : (item.price || 0),
    image: item.image || '',
    quantity: item.quantity || 1,
    merchantId: item.merchantId || '',
    selectedOptions: Array.isArray(item.selectedOptions) 
      ? item.selectedOptions.filter((opt: any) => 
          opt && opt.groupId && opt.groupName && opt.optionId && opt.optionName
        ) 
      : []
  };
};

/**
 * Recupera e normaliza a lista de pedidos de um usuário.
 */
export const getLocalOrders = (userId: string): LocalOrder[] => {
  const ordersKey = `apois_orders_${userId}`;
  try {
    const rawOrders = JSON.parse(localStorage.getItem(ordersKey) || "[]");
    if (!Array.isArray(rawOrders)) return [];

    return rawOrders.map((order: any) => ({
      ...order,
      items: Array.isArray(order.items) ? order.items.map(normalizeLocalOrderItem) : []
    }));
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
