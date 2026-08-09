import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

export type CartSelectedOption = {
  groupId: string;
  groupName: string;
  optionId: string;
  optionName: string;
  priceDelta: number;
};

export type CartItem = {
  id: string; // ID real do produto
  lineId: string; // Identificador único da linha na sacola
  name: string;
  description: string;
  price: number; // Preço unitário FINAL (base + deltas)
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
  isHydrated: boolean;
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

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<CartItem[]>([]);
  const [merchant, setMerchant] = useState<CartMerchant | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);

  // Carrega o estado persistido somente no cliente. A flag impede que o efeito de
  // persistência apague a sacola antes desta leitura terminar durante hydration/reload.
  useEffect(() => {
    const savedCart = localStorage.getItem("apois_cart");
    const savedMerchant = localStorage.getItem("apois_merchant");

    if (savedCart) {
      try {
        const parsedCart = JSON.parse(savedCart);
        if (Array.isArray(parsedCart)) {
          const normalizedCart = parsedCart.map((item: any) => ({
            ...item,
            lineId: item.lineId || item.id,
            basePrice: item.basePrice !== undefined ? item.basePrice : item.price,
            selectedOptions: item.selectedOptions || [],
          }));
          setItems(normalizedCart);
        }
      } catch (e) {
        console.error("Erro ao carregar itens da sacola:", e);
      }
    }

    if (savedMerchant) {
      try {
        setMerchant(JSON.parse(savedMerchant));
      } catch (e) {
        console.error("Erro ao carregar estabelecimento da sacola:", e);
      }
    }

    setIsHydrated(true);
  }, []);

  // Só persiste depois que a leitura inicial terminou. Sem esse gate, a primeira
  // renderização ([]/null) sobrescreve localStorage antes da recuperação da sacola.
  useEffect(() => {
    if (!isHydrated) return;

    localStorage.setItem("apois_cart", JSON.stringify(items));
    if (merchant) {
      localStorage.setItem("apois_merchant", JSON.stringify(merchant));
    } else {
      localStorage.removeItem("apois_merchant");
    }
  }, [items, merchant, isHydrated]);

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

    const basePrice = newItem.basePrice !== undefined ? newItem.basePrice : newItem.price;
    const selectedOptions = newItem.selectedOptions || [];

    // Calcula o preço unitário final
    const priceDelta = selectedOptions.reduce((acc, opt) => acc + opt.priceDelta, 0);
    const finalUnitPrice = basePrice + priceDelta;

    // Gera o lineId determinístico
    let lineId = newItem.id;
    if (selectedOptions.length > 0) {
      const sortedOptionIds = [...selectedOptions]
        .map((o) => o.optionId)
        .sort()
        .join(",");
      lineId = `${newItem.id}::${sortedOptionIds}`;
    }

    setItems((prev) => {
      const existingItem = prev.find((item) => item.lineId === lineId);
      if (existingItem) {
        return prev.map((item) =>
          item.lineId === lineId ? { ...item, quantity: item.quantity + 1 } : item,
        );
      }
      return [
        ...prev,
        {
          ...newItem,
          lineId,
          basePrice,
          price: finalUnitPrice,
          selectedOptions,
          quantity: 1,
        } as CartItem,
      ];
    });
  };

  const updateQuantity = (lineId: string, delta: number) => {
    setItems((prev) => {
      const newItems = prev.flatMap((item) => {
        if (item.lineId === lineId) {
          const newQty = item.quantity + delta;
          return newQty > 0 ? [{ ...item, quantity: newQty }] : [];
        }
        return [item];
      });

      if (newItems.length === 0) {
        setMerchant(null);
      }

      return newItems;
    });
  };

  const removeItem = (lineId: string) => {
    setItems((prev) => {
      const newItems = prev.filter((item) => item.lineId !== lineId);
      if (newItems.length === 0) {
        setMerchant(null);
      }
      return newItems;
    });
  };

  // Payment confirmation depends on this callback identity. Keeping it stable prevents
  // the PIX reconciliation effect from being torn down between clearing the cart and
  // executing its redirect timer.
  const clearCart = useCallback(() => {
    setItems([]);
    setMerchant(null);
  }, []);

  const totalItems = items.reduce((acc, item) => acc + item.quantity, 0);
  const totalPrice = items.reduce((acc, item) => acc + item.price * item.quantity, 0);

  return (
    <CartContext.Provider
      value={{
        items,
        merchant,
        isHydrated,
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
