import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useIsDeveloper } from "@/hooks/useIsDeveloper";
import { BootScreen } from "@/components/layout/BootScreen";

export function RequireDeveloper({ children }: { children: ReactNode }) {
  const { isDeveloper, isLoading } = useIsDeveloper();

  if (isLoading) return <BootScreen />;

  if (!isDeveloper) return <Navigate to="/" replace />;

  return <>{children}</>;
}
