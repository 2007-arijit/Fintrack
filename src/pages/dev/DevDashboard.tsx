import { Link } from "react-router-dom";
import { useAdminUserStats } from "@/hooks/useAdminUsers";
import { Users, Bell, ChevronRight, ShieldCheck } from "lucide-react";

export default function DevDashboard() {
  const { data: stats, isLoading } = useAdminUserStats();

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-6 w-6 text-primary" />
        <h1 className="font-heading font-bold text-2xl">Developer Dashboard</h1>
      </div>

      <div className="glass-card p-6">
        <p className="text-sm text-muted-foreground">Total registered users</p>
        <p className="text-4xl font-bold mt-1">{isLoading ? "—" : stats?.total_users ?? 0}</p>
      </div>

      <div className="space-y-2">
        <Link to="/dev/users" className="glass-card p-4 flex items-center gap-3 hover:bg-secondary/40 transition-colors">
          <div className="p-2 rounded-lg bg-primary/10 shrink-0">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold">All Users</p>
            <p className="text-xs text-muted-foreground">Presence, chat activity, block/unblock</p>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        </Link>

        <Link to="/dev/push" className="glass-card p-4 flex items-center gap-3 hover:bg-secondary/40 transition-colors">
          <div className="p-2 rounded-lg bg-primary/10 shrink-0">
            <Bell className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold">Push Notifications</p>
            <p className="text-xs text-muted-foreground">Send to everyone, or hand-pick recipients</p>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        </Link>
      </div>
    </div>
  );
}
