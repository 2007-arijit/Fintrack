import { useUserPreferences } from "@/hooks/useUserPreferences";

/** Whether the current user has developer/admin dashboard access. */
export function useIsDeveloper() {
  const { preferences, isLoading } = useUserPreferences();
  return { isDeveloper: !!preferences?.is_developer, isLoading };
}
