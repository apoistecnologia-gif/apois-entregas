import React, { useState, useEffect, useMemo } from "react";
import { X, Plus, Minus, Check } from "lucide-react";
import { 
  Sheet, 
  SheetContent, 
  SheetHeader, 
  SheetTitle,
  SheetFooter
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Database } from "@/integrations/supabase/types";
import { CartSelectedOption } from "@/contexts/CartContext";

type Product = Database["public"]["Tables"]["products"]["Row"];
type OptionGroup = Database["public"]["Tables"]["product_option_groups"]["Row"];
type Option = Database["public"]["Tables"]["product_options"]["Row"];

interface ProductCustomizationSheetProps {
  product: Product;
  groups: OptionGroup[];
  options: Option[];
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (selectedOptions: CartSelectedOption[]) => void;
}

export const ProductCustomizationSheet: React.FC<ProductCustomizationSheetProps> = ({
  product,
  groups,
  options,
  isOpen,
  onClose,
  onConfirm,
}) => {
  const [selections, setSelections] = useState<Record<string, string[]>>({});

  useEffect(() => {
    if (isOpen) {
      setSelections({});
    }
  }, [isOpen]);

  const handleToggleOption = (groupId: string, optionId: string, maxSelections: number | null) => {
    setSelections((prev) => {
      const current = prev[groupId] || [];
      const isSelected = current.includes(optionId);

      if (isSelected) {
        return {
          ...prev,
          [groupId]: current.filter((id) => id !== optionId),
        };
      }

      // Se maxSelections === 1, substitui a seleção
      if (maxSelections === 1) {
        return {
          ...prev,
          [groupId]: [optionId],
        };
      }

      // Se já atingiu o limite, não faz nada
      if (maxSelections && current.length >= maxSelections) {
        return prev;
      }

      return {
        ...prev,
        [groupId]: [...current, optionId],
      };
    });
  };

  const getGroupStatus = (group: OptionGroup) => {
    const selectedCount = (selections[group.id] || []).length;
    const min = group.min_selections || 0;
    const max = group.max_selections;

    if (min === 0 && !max) return "Opcional";
    if (min > 0 && max === 1) return "Escolha 1";
    if (min === 0 && max && max > 1) return `Escolha até ${max}`;
    if (min > 0 && max && max > 1 && min === max) return `Escolha ${min}`;
    if (min > 0 && max && max > 1) return `Escolha de ${min} a ${max}`;
    
    return "Opcional";
  };

  const isGroupValid = (group: OptionGroup) => {
    const selectedCount = (selections[group.id] || []).length;
    const min = group.min_selections || 0;
    const max = group.max_selections;

    if (selectedCount < min) return false;
    if (max && selectedCount > max) return false;
    return true;
  };

  const isAllValid = groups.every(isGroupValid);

  const totalPrice = useMemo(() => {
    let extra = 0;
    Object.entries(selections).forEach(([groupId, optionIds]) => {
      optionIds.forEach((optId) => {
        const opt = options.find((o) => o.id === optId);
        if (opt) extra += Number(opt.price_delta);
      });
    });
    return Number(product.price) + extra;
  }, [product.price, selections, options]);

  const handleConfirm = () => {
    if (!isAllValid) return;

    const formattedOptions: CartSelectedOption[] = Object.entries(selections).flatMap(([groupId, optionIds]) => {
      const group = groups.find((g) => g.id === groupId);
      if (!group) return [];
      
      return optionIds.flatMap((optId) => {
        const opt = options.find((o) => o.id === optId);
        if (!opt) return [];
        
        return [{
          groupId: group.id,
          groupName: group.name,
          optionId: opt.id,
          optionName: opt.name,
          priceDelta: Number(opt.price_delta || 0),
        }];
      });
    });

    onConfirm(formattedOptions);
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent 
        side="bottom" 
        className="h-[90vh] bg-zinc-950 border-zinc-800 p-0 rounded-t-[32px] overflow-hidden flex flex-col focus:outline-none"
      >
        <SheetHeader className="p-4 border-b border-zinc-900 shrink-0">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-white text-lg font-bold">{product.name}</SheetTitle>
            <button onClick={onClose} className="p-2 text-zinc-400">
              <X className="h-6 w-6" />
            </button>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto no-scrollbar">
          {product.image_url && (
            <div className="w-full h-48 bg-zinc-900">
              <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
            </div>
          )}
          
          <div className="p-4 space-y-2">
            <p className="text-zinc-400 text-sm leading-relaxed">{product.description}</p>
            <p className="text-primary font-black text-lg">
              A partir de R$ {Number(product.price).toFixed(2).replace(".", ",")}
            </p>
          </div>

          <div className="space-y-6 pb-32">
            {groups.map((group) => (
              <div key={group.id} className="space-y-3">
                <div className="bg-zinc-900/50 px-4 py-3 flex items-center justify-between">
                  <div>
                    <h3 className="text-white font-bold text-sm">{group.name}</h3>
                    <p className="text-[10px] text-zinc-500 uppercase tracking-wider">
                      {getGroupStatus(group)}
                    </p>
                  </div>
                  {group.min_selections && group.min_selections > 0 && (
                    <span className="bg-zinc-800 text-[10px] px-2 py-0.5 rounded-full text-zinc-400 font-bold uppercase">
                      Obrigatório
                    </span>
                  )}
                </div>

                <div className="px-4 space-y-1">
                  {options
                    .filter((opt) => opt.option_group_id === group.id)
                    .map((option) => {
                      const isSelected = (selections[group.id] || []).includes(option.id);
                      const isDisabled = 
                        !isSelected && 
                        group.max_selections !== null && 
                        group.max_selections > 1 &&
                        (selections[group.id] || []).length >= group.max_selections;

                      return (
                        <div 
                          key={option.id}
                          onClick={() => !isDisabled && handleToggleOption(group.id, option.id, group.max_selections)}
                          className={`flex items-center justify-between py-4 border-b border-zinc-900 last:border-0 transition-opacity ${isDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer active:opacity-70'}`}
                        >
                          <div className="flex-1 min-w-0 pr-4">
                            <p className={`text-[14px] font-bold ${isSelected ? 'text-primary' : 'text-zinc-200'}`}>
                              {option.name}
                            </p>
                            {Number(option.price_delta) > 0 && (
                              <p className="text-xs text-primary font-medium mt-0.5">
                                + R$ {Number(option.price_delta).toFixed(2).replace(".", ",")}
                              </p>
                            )}
                          </div>
                          
                          <div className={`h-6 w-6 rounded-full border-2 flex items-center justify-center transition-colors ${isSelected ? 'bg-primary border-primary text-black' : 'border-zinc-800'}`}>
                            {isSelected && <Check className="h-4 w-4 stroke-[3]" />}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            ))}
          </div>
        </div>

        <SheetFooter className="absolute bottom-0 left-0 right-0 bg-zinc-950 border-t border-zinc-900 p-4 pt-6 flex flex-row items-center gap-4 sm:justify-between">
          <div className="flex-1">
            <p className="text-zinc-500 text-[10px] uppercase font-bold tracking-widest">Total</p>
            <p className="text-white text-xl font-black">
              R$ {totalPrice.toFixed(2).replace(".", ",")}
            </p>
          </div>
          <Button
            onClick={handleConfirm}
            disabled={!isAllValid}
            className={`h-14 px-8 rounded-2xl font-black uppercase tracking-tight transition-all active:scale-95 ${isAllValid ? 'bg-primary text-black shadow-[0_8px_20px_rgba(255,215,0,0.3)]' : 'bg-zinc-800 text-zinc-500'}`}
          >
            Confirmar
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};
