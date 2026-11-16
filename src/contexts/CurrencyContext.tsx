import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import {
  CurrencyCode,
  formatCurrency as formatCurrencyFn,
  formatCompactCurrency,
} from "@/lib/formatCurrency";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./AuthContext";

interface CurrencyContextType {
  currency: CurrencyCode;
  setCurrency: (code: CurrencyCode) => void;
  format: (amount: number) => string;
  /** Compact form for chart axes and dense rows: ₹1.2L, $4.8K. */
  formatCompact: (amount: number) => string;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrencyState] = useState<CurrencyCode>("INR");
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    supabase
      .from("user_preferences")
      .select("currency")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        if (data?.currency) setCurrencyState(data.currency as CurrencyCode);
      });
  }, [user]);

  const setCurrency = async (code: CurrencyCode) => {
    setCurrencyState(code);
    if (user) {
      const { error } = await supabase
        .from("user_preferences")
        .update({ currency: code })
        .eq("user_id", user.id);
      if (error) console.error("Failed to persist currency:", error.message);
    }
  };

  const format = (amount: number) => formatCurrencyFn(amount, currency);
  const formatCompact = (amount: number) => formatCompactCurrency(amount, currency);

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency, format, formatCompact }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const context = useContext(CurrencyContext);
  if (!context) throw new Error("useCurrency must be used within CurrencyProvider");
  return context;
}
