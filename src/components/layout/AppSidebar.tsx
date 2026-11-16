import { NavLink } from "@/components/NavLink";
import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  ArrowLeftRight,
  PiggyBank,
  BarChart3,
  Settings,
  LogOut,
  Wallet,
  Handshake,
  Users,
  MessageCircle,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { useUnreadCount } from "@/hooks/useChat";
import { useIsDeveloper } from "@/hooks/useIsDeveloper";

const PRIMARY_ITEMS: { title: string; url: string; icon: LucideIcon; end?: boolean }[] = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard, end: true },
  { title: "Transactions", url: "/transactions", icon: ArrowLeftRight },
  { title: "PayShield", url: "/payshield", icon: ShieldAlert },
  { title: "Debt Tracker", url: "/debt", icon: Handshake },
  { title: "Split", url: "/split", icon: Users },
  { title: "Chat", url: "/chat", icon: MessageCircle },
  { title: "Reports", url: "/reports", icon: BarChart3 },
  { title: "Budgets", url: "/budgets", icon: PiggyBank },
];

const ACCOUNT_ITEMS: { title: string; url: string; icon: LucideIcon; end?: boolean }[] = [
  { title: "Settings", url: "/settings", icon: Settings },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { signOut } = useAuth();
  const unreadCount = useUnreadCount();
  const { isDeveloper } = useIsDeveloper();

  const idleClass =
    "relative rounded-lg text-sidebar-foreground transition-colors hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground";
  const activeClass =
    "relative rounded-lg bg-primary/10 text-primary font-medium before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-primary";

  const renderItem = (item: { title: string; url: string; icon: LucideIcon; end?: boolean }) => (
    <SidebarMenuItem key={item.title}>
      <SidebarMenuButton asChild className="rounded-lg">
        <NavLink
          to={item.url}
          end={item.end}
          className={idleClass}
          activeClassName={activeClass}
        >
          <item.icon className="mr-2 h-4 w-4 shrink-0" aria-hidden="true" />
          {!collapsed && <span className="flex-1 text-sm">{item.title}</span>}
          {!collapsed && item.title === "Chat" && unreadCount > 0 && (
            <Badge className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border bg-sidebar">
      <div className="flex items-center gap-2.5 px-3 py-4 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/20">
          <Wallet className="h-4 w-4" aria-hidden="true" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="font-heading text-[15px] font-semibold leading-tight tracking-tight text-foreground">
              FinTrack
            </p>
            <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Personal finance</p>
          </div>
        )}
      </div>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground/80">
            Workspace
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{PRIMARY_ITEMS.map(renderItem)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground/80">
            Account
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {ACCOUNT_ITEMS.map(renderItem)}
              {isDeveloper && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild className="rounded-lg">
                    <NavLink to="/dev" className={idleClass} activeClassName={activeClass}>
                      <ShieldCheck className="mr-2 h-4 w-4 shrink-0" aria-hidden="true" />
                      {!collapsed && <span className="flex-1 text-sm">Developer</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border/70 p-2">
        <SidebarMenuButton
          onClick={signOut}
          className="cursor-pointer rounded-lg text-muted-foreground transition-colors hover:bg-sidebar-accent/70 hover:text-foreground"
        >
          <LogOut className="mr-2 h-4 w-4 shrink-0" aria-hidden="true" />
          {!collapsed && <span className="text-sm">Sign out</span>}
        </SidebarMenuButton>
      </SidebarFooter>
    </Sidebar>
  );
}
