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
const CART_OWNER_KEY = "apois_cart_owner_id";
const BOUND_USER_KEY = "apois_bound_user_id";

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<CartItem[]>([]);
  const [merchant, setMerchant] = useState<CartMerchant | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);

  // Carrega e saneia o estado persistido somente no cliente. A sacola nunca pode
  // conter itens de estabelecimentos diferentes, mesmo se o localStorage estiver
  // antigo, parcialmente corrompido ou tiver sido alterado manualmente.
  useEffect(() => {
    const savedCart = localStorage.getItem("apois_cart");
    const savedMerchant = localStorage.getItem("apois_merchant");

    let restoredMerchant: CartMerchant | null = null;
    if (savedMerchant) {
      try {
        const parsedMerchant = JSON.parse(savedMerchant);
        if (parsedMerchant?.id && typeof parsedMerchant.id === "string") {
          restoredMerchant = parsedMerchant as CartMerchant;
        }
      } catch (e) {
        console.error("Erro ao carregar estabelecimento da sacola:", e);
      }
    }

    let restoredItems: CartItem[] = [];
    if (savedCart && restoredMerchant) {
      try {
        const parsedCart = JSON.parse(savedCart);
        if (Array.isArray(parsedCart)) {
          restoredItems = parsedCart
            .filter(
              (item: any) =>
                item &&
                typeof item.id === "string" &&
                typeof item.merchantId === "string" &&
                item.merchantId === restoredMerchant?.id &&
                Number.isFinite(Number(item.quantity)) &&
                Number(item.quantity) > 0,
            )
            .map((item: any) => ({
              ...item,
              lineId: item.lineId || item.id,
              quantity: Number(item.quantity),
              basePrice: item.basePrice !== undefined ? item.basePrice : item.price,
              selectedOptions: Array.isArray(item.selectedOptions) ? item.selectedOptions : [],
            }));
        }
      } catch (e) {
        console.error("Erro ao carregar itens da sacola:", e);
      }
    }

    if (restoredMerchant && restoredItems.length > 0) {
      setMerchant(restoredMerchant);
      setItems(restoredItems);
    } else {
      localStorage.removeItem("apois_cart");
      localStorage.removeItem("apois_merchant");
      localStorage.removeItem(CART_OWNER_KEY);
      setMerchant(null);
      setItems([]);
    }

    setIsHydrated(true);
  }, []);

  // Só persiste depois que a leitura inicial terminou. Sem esse gate, a primeira
  // renderização ([]/null) sobrescreve localStorage antes da recuperação da sacola.
  useEffect(() => {
    if (!isHydrated) return;

    if (merchant && items.length > 0) {
      localStorage.setItem("apois_cart", JSON.stringify(items));
      localStorage.setItem("apois_merchant", JSON.stringify(merchant));

      const boundUserId = sessionStorage.getItem(BOUND_USER_KEY);
      if (boundUserId) localStorage.setItem(CART_OWNER_KEY, boundUserId);
      else localStorage.removeItem(CART_OWNER_KEY);
    } else {
      localStorage.removeItem("apois_cart");
      localStorage.removeItem("apois_merchant");
      localStorage.removeItem(CART_OWNER_KEY);
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
    const basePrice = newItem.basePrice !== undefined ? newItem.basePrice : newItem.price;
    const selectedOptions = newItem.selectedOptions || [];

    // Calcula o preço unitário final. O backend recalcula os valores oficiais no
    // checkout; este valor existe somente para a experiência da sacola.
    const priceDelta = selectedOptions.reduce((acc, opt) => acc + opt.priceDelta, 0);
    const finalUnitPrice = basePrice + priceDelta;

    // Gera o lineId determinístico.
    let lineId = newItem.id;
    if (selectedOptions.length > 0) {
      const sortedOptionIds = [...selectedOptions]
        .map((o) => o.optionId)
        .sort()
        .join(",");
      lineId = `${newItem.id}::${sortedOptionIds}`;
    }

    setMerchant(merchantData);
    setItems((prev) => {
      // Defesa em profundidade: o fluxo da loja já pede confirmação antes de trocar
      // de estabelecimento, mas o estado global também impede mistura caso outro
      // chamador ou um estado persistido inconsistente tente fazê-la.
      const sameMerchantItems = prev.every((item) => item.merchantId === merchantData.id)
        ? prev
        : [];
      const existingItem = sameMerchantItems.find((item) => item.lineId === lineId);
      if (existingItem) {
        return sameMerchantItems.map((item) =>
          item.lineId === lineId ? { ...item, quantity: item.quantity + 1 } : item,
        );
      }
      return [
        ...sameMerchantItems,
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
