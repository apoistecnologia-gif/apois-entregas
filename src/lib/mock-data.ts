export type Merchant = {
  id: string;
  name: string;
  rating: number;
  reviewCount: number;
  deliveryTime: string;
  deliveryFee: number;
  isOpen: boolean;
  closeTime: string;
  description: string;
  coverImage: string;
  logoImage: string;
  category: string;
  tags: string[];
};

export const MOCK_MERCHANTS: Merchant[] = [
  {
    id: "brasa-burguer",
    name: "Brasa Burguer",
    rating: 4.8,
    reviewCount: 1248,
    deliveryTime: "30-40 min",
    deliveryFee: 5.99,
    isOpen: true,
    closeTime: "23:30",
    description: "Hambúrgueres artesanais grelhados no braseiro, com ingredientes frescos e muito sabor. Do clássico ao smash, aqui é tudo feito com paixão pela brasa!",
    coverImage: "https://images.unsplash.com/photo-1571091718767-18b5b1457add?q=80&w=1000&auto=format&fit=crop",
    logoImage: "https://images.unsplash.com/photo-1594212699903-ec8a3eca50f5?q=80&w=200&auto=format&fit=crop",
    category: "Restaurantes",
    tags: ["burger", "hambúrguer", "lanche", "artesanal", "brasa"],
  }
];
