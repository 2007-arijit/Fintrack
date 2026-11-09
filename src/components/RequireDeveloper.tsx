import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useIsDeveloper } from "@/hooks/useIsDeveloper";

export function RequireDeveloper({ children }: { children: ReactNode }) {
  const { isDeveloper, isLoading } = useIsDeveloper();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!isDeveloper) return <Navigate to="/" replace />;

  return <>{children}</>;
}
