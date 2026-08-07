import React, { createContext, useContext, useState, useEffect } from 'react';

export type CartItem = {
  id: string;
  name: string;
  description: string;
  price: number;
  image: string;
  quantity: number;
  merchantId: string;
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
  addItem: (item: Omit<CartItem, 'quantity'>, merchantData: CartMerchant) => void;
  updateQuantity: (id: string, delta: number) => void;
  removeItem: (id: string) => void;
  clearCart: () => void;
  totalItems: number;
  totalPrice: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<CartItem[]>([]);
  const [merchant, setMerchant] = useState<CartMerchant | null>(null);

  // Carregar do localStorage na inicialização
  useEffect(() => {
    const savedCart = localStorage.getItem('apois_cart');
    const savedMerchant = localStorage.getItem('apois_merchant');
    if (savedCart) {
      try {
        setItems(JSON.parse(savedCart));
      } catch (e) {
        console.error('Erro ao carregar itens da sacola:', e);
      }
    }
    if (savedMerchant) {
      try {
        setMerchant(JSON.parse(savedMerchant));
      } catch (e) {
        console.error('Erro ao carregar estabelecimento da sacola:', e);
      }
    }
  }, []);

  // Persistir no localStorage sempre que mudar
  useEffect(() => {
    localStorage.setItem('apois_cart', JSON.stringify(items));
    if (merchant) {
      localStorage.setItem('apois_merchant', JSON.stringify(merchant));
    } else {
      localStorage.removeItem('apois_merchant');
    }
  }, [items, merchant]);

  const addItem = (newItem: Omit<CartItem, 'quantity'>, merchantData: CartMerchant) => {
     if (!merchant || merchant.id !== merchantData.id) {
       setMerchant(merchantData);
     }
    
    setItems(prev => {
      const existingItem = prev.find(item => item.id === newItem.id);
      if (existingItem) {
        return prev.map(item => 
          item.id === newItem.id 
            ? { ...item, quantity: item.quantity + 1 } 
            : item
        );
      }
      return [...prev, { ...newItem, quantity: 1 }];
    });
  };

  const updateQuantity = (id: string, delta: number) => {
    setItems(prev => {
      const newItems = prev.map(item => {
        if (item.id === id) {
          const newQty = item.quantity + delta;
          return newQty > 0 ? { ...item, quantity: newQty } : item;
        }
        return item;
      }).filter(item => item.quantity > 0);
      
      if (newItems.length === 0) {
        setMerchant(null);
      }
      
      return newItems;
    });
  };

  const removeItem = (id: string) => {
    setItems(prev => {
      const newItems = prev.filter(item => item.id !== id);
      if (newItems.length === 0) {
        setMerchant(null);
      }
      return newItems;
    });
  };

  const clearCart = () => {
    setItems([]);
    setMerchant(null);
  };

  const totalItems = items.reduce((acc, item) => acc + item.quantity, 0);
  const totalPrice = items.reduce((acc, item) => acc + (item.price * item.quantity), 0);

  return (
    <CartContext.Provider value={{ 
      items, 
      merchant,
      addItem, 
      updateQuantity, 
      removeItem, 
      clearCart,
      totalItems,
      totalPrice
    }}>
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};
