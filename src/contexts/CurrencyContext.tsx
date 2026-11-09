import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { CurrencyCode, formatCurrency as formatCurrencyFn } from "@/lib/formatCurrency";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./AuthContext";

interface CurrencyContextType {
  currency: CurrencyCode;
  setCurrency: (code: CurrencyCode) => void;
  format: (amount: number) => string;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrencyState] = useState<CurrencyCode>("INR");
  const { user } = useAuth();

  useEffect(() => {
    let active = true;
    setCurrencyState("INR");
    if (!user) return () => { active = false; };

    supabase
      .from("user_preferences")
      .select("currency")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          console.error("Failed to load currency preference:", error.message);
          return;
        }
        if (data?.currency) setCurrencyState(data.currency as CurrencyCode);
      });

    return () => { active = false; };
  }, [user?.id]);

  const setCurrency = async (code: CurrencyCode) => {
    const previous = currency;
    setCurrencyState(code);
    if (user) {
      const { error } = await supabase
        .from("user_preferences")
        .update({ currency: code })
        .eq("user_id", user.id);
      if (error) {
        console.error("Failed to persist currency:", error.message);
        setCurrencyState(previous);
      }
    }
  };

  const format = (amount: number) => formatCurrencyFn(amount, currency);

  return <CurrencyContext.Provider value={{ currency, setCurrency, format }}>{children}</CurrencyContext.Provider>;
}

export function useCurrency() {
  const context = useContext(CurrencyContext);
  if (!context) throw new Error("useCurrency must be used within CurrencyProvider");
  return context;
}
