import React, { createContext, useContext, useEffect, useState } from "react";

export type CartSelectedOption = {
  groupId: string;
  groupName: string;
  optionId: string;
  optionName: string;
  priceDelta: number;
};

export type CartItem = {
  id: string;
  lineId: string;
  name: string;
  description: string;
  price: number;
  basePrice: number;
  image: string;
  quantity: number;
  merchantId: string;
  selectedOptions: CartSelectedOption[];
};

export type CartMerchant = {
  id: string;
  name: string;
  logo: string;
  deliveryFee: number;
  deliveryTime: string;
  closeTime: string;
  category?: string;
};

interface CartContextType {
  items: CartItem[];
  merchant: CartMerchant | null;
  addItem: (
    item: Omit<CartItem, "quantity" | "lineId" | "price" | "basePrice" | "selectedOptions"> & {
      price: number;
      basePrice?: number;
      selectedOptions?: CartSelectedOption[];
    },
    merchantData: CartMerchant,
  ) => void;
  updateQuantity: (lineId: string, delta: number) => void;
  removeItem: (lineId: string) => void;
  clearCart: () => void;
  totalItems: number;
  totalPrice: number;
}

type UnknownRecord = {
  groupId?: unknown;
  groupName?: unknown;
  optionId?: unknown;
  optionName?: unknown;
  priceDelta?: unknown;
  id?: unknown;
  lineId?: unknown;
  name?: unknown;
  description?: unknown;
  price?: unknown;
  basePrice?: unknown;
  image?: unknown;
  quantity?: unknown;
  merchantId?: unknown;
  selectedOptions?: unknown;
  logo?: unknown;
  deliveryFee?: unknown;
  deliveryTime?: unknown;
  closeTime?: unknown;
  category?: unknown;
};

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isString = (value: unknown): value is string => typeof value === "string";
const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

function parseSelectedOption(value: unknown): CartSelectedOption | null {
  if (!isRecord(value)) return null;
  if (
    !isString(value.groupId) ||
    !isString(value.groupName) ||
    !isString(value.optionId) ||
    !isString(value.optionName) ||
    !isFiniteNumber(value.priceDelta)
  ) {
    return null;
  }

  return {
    groupId: value.groupId,
    groupName: value.groupName,
    optionId: value.optionId,
    optionName: value.optionName,
    priceDelta: value.priceDelta,
  };
}

function parseStoredCartItem(value: unknown): CartItem | null {
  if (!isRecord(value)) return null;

  const id = isString(value.id) ? value.id : "";
  const name = isString(value.name) ? value.name : "";
  const merchantId = isString(value.merchantId) ? value.merchantId : "";
  const price = isFiniteNumber(value.price) ? value.price : 0;
  const basePrice = isFiniteNumber(value.basePrice) ? value.basePrice : price;
  const quantity = isFiniteNumber(value.quantity) && value.quantity > 0 ? Math.floor(value.quantity) : 1;

  if (!id || !name || !merchantId) return null;

  const selectedOptions = Array.isArray(value.selectedOptions)
    ? value.selectedOptions
        .map(parseSelectedOption)
        .filter((option): option is CartSelectedOption => option !== null)
    : [];

  return {
    id,
    lineId: isString(value.lineId) && value.lineId ? value.lineId : id,
    name,
    description: isString(value.description) ? value.description : "",
    price,
    basePrice,
    image: isString(value.image) ? value.image : "",
    quantity,
    merchantId,
    selectedOptions,
  };
}

function parseStoredMerchant(value: unknown): CartMerchant | null {
  if (!isRecord(value)) return null;
  if (!isString(value.id) || !isString(value.name)) return null;

  const category = isString(value.category) ? value.category : null;

  return {
    id: value.id,
    name: value.name,
    logo: isString(value.logo) ? value.logo : "",
    deliveryFee: isFiniteNumber(value.deliveryFee) ? value.deliveryFee : 0,
    deliveryTime: isString(value.deliveryTime) ? value.deliveryTime : "",
    closeTime: isString(value.closeTime) ? value.closeTime : "",
    ...(category ? { category } : {}),
  };
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<CartItem[]>([]);
  const [merchant, setMerchant] = useState<CartMerchant | null>(null);

  useEffect(() => {
    const savedCart = localStorage.getItem("apois_cart");
    const savedMerchant = localStorage.getItem("apois_merchant");

    if (savedCart) {
      try {
        const parsed: unknown = JSON.parse(savedCart);
        if (Array.isArray(parsed)) {
          setItems(
            parsed
              .map(parseStoredCartItem)
              .filter((item): item is CartItem => item !== null),
          );
        }
      } catch (error) {
        console.error("Erro ao carregar itens da sacola:", error);
      }
    }

    if (savedMerchant) {
      try {
        const parsed: unknown = JSON.parse(savedMerchant);
        setMerchant(parseStoredMerchant(parsed));
      } catch (error) {
        console.error("Erro ao carregar estabelecimento da sacola:", error);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("apois_cart", JSON.stringify(items));
    if (merchant) {
      localStorage.setItem("apois_merchant", JSON.stringify(merchant));
    } else {
      localStorage.removeItem("apois_merchant");
    }
  }, [items, merchant]);

  const addItem = (
    newItem: Omit<CartItem, "quantity" | "lineId" | "price" | "basePrice" | "selectedOptions"> & {
      price: number;
      basePrice?: number;
      selectedOptions?: CartSelectedOption[];
    },
    merchantData: CartMerchant,
  ) => {
    if (!merchant || merchant.id !== merchantData.id) {
      setMerchant(merchantData);
    }

    const basePrice = newItem.basePrice ?? newItem.price;
    const selectedOptions = newItem.selectedOptions ?? [];
    const priceDelta = selectedOptions.reduce((sum, option) => sum + option.priceDelta, 0);
    const finalUnitPrice = basePrice + priceDelta;

    let lineId = newItem.id;
    if (selectedOptions.length > 0) {
      const sortedOptionIds = [...selectedOptions]
        .map((option) => option.optionId)
        .sort()
        .join(",");
      lineId = `${newItem.id}::${sortedOptionIds}`;
    }

    setItems((currentItems) => {
      const existingItem = currentItems.find((item) => item.lineId === lineId);
      if (existingItem) {
        return currentItems.map((item) =>
          item.lineId === lineId ? { ...item, quantity: item.quantity + 1 } : item,
        );
      }

      return [
        ...currentItems,
        {
          ...newItem,
          lineId,
          basePrice,
          price: finalUnitPrice,
          selectedOptions,
          quantity: 1,
        },
      ];
    });
  };

  const updateQuantity = (lineId: string, delta: number) => {
    setItems((currentItems) => {
      const nextItems = currentItems.flatMap((item) => {
        if (item.lineId !== lineId) return [item];
        const nextQuantity = item.quantity + delta;
        return nextQuantity > 0 ? [{ ...item, quantity: nextQuantity }] : [];
      });

      if (nextItems.length === 0) setMerchant(null);
      return nextItems;
    });
  };

  const removeItem = (lineId: string) => {
    setItems((currentItems) => {
      const nextItems = currentItems.filter((item) => item.lineId !== lineId);
      if (nextItems.length === 0) setMerchant(null);
      return nextItems;
    });
  };

  const clearCart = () => {
    setItems([]);
    setMerchant(null);
  };

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalPrice = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  return (
    <CartContext.Provider
      value={{
        items,
        merchant,
        addItem,
        updateQuantity,
        removeItem,
        clearCart,
        totalItems,
        totalPrice,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
};
