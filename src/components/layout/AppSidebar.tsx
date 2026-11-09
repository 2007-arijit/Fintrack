import { NavLink } from "@/components/NavLink";
import { LayoutDashboard, ArrowLeftRight, PiggyBank, BarChart3, Settings, LogOut, Wallet, Handshake, Users, MessageCircle, ShieldCheck, ShieldAlert } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
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

const NAV_ITEMS = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Transactions", url: "/transactions", icon: ArrowLeftRight },
  { title: "PayShield", url: "/payshield", icon: ShieldAlert },
  { title: "Split", url: "/split", icon: Users },
  { title: "Debt Tracker", url: "/debt", icon: Handshake },
  { title: "Chat", url: "/chat", icon: MessageCircle },
  { title: "Reports", url: "/reports", icon: BarChart3 },
  { title: "Budgets", url: "/budgets", icon: PiggyBank },
  { title: "Settings", url: "/settings", icon: Settings },
];

// The active page gets a tinted row and a slim accent bar on the leading edge.
const linkClass = "relative transition-colors hover:bg-sidebar-accent";
const activeClass =
  "bg-sidebar-accent text-primary font-medium before:absolute before:left-0 before:top-2 before:bottom-2 before:w-0.5 before:rounded-full before:bg-primary";

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { signOut } = useAuth();
  const unreadCount = useUnreadCount();
  const { isDeveloper } = useIsDeveloper();

  const items = isDeveloper ? [...NAV_ITEMS, { title: "Developer", url: "/dev", icon: ShieldCheck }] : NAV_ITEMS;

  return (
    <Sidebar collapsible="icon" className="border-r border-border bg-sidebar">
      <div className="flex items-center gap-2.5 p-4">
        <div className="shrink-0 rounded-lg bg-primary p-2 text-primary-foreground">
          <Wallet className="h-5 w-5" aria-hidden />
        </div>
        {!collapsed && <span className="font-heading text-lg font-bold tracking-tight">FinTrack</span>}
      </div>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild tooltip={item.title}>
                    <NavLink to={item.url} end={item.url === "/"} className={linkClass} activeClassName={activeClass}>
                      <item.icon className="mr-2 h-4 w-4 shrink-0" aria-hidden />
                      {!collapsed && <span className="flex-1">{item.title}</span>}
                      {!collapsed && item.title === "Chat" && unreadCount > 0 && (
                        <Badge className="flex h-5 min-w-5 items-center justify-center px-1 text-[10px]">
                          <span className="sr-only">Unread messages: </span>{unreadCount > 9 ? "9+" : unreadCount}
                        </Badge>
                      )}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-2">
        <SidebarMenuButton onClick={signOut} tooltip="Sign out" className="cursor-pointer text-muted-foreground hover:bg-sidebar-accent">
          <LogOut className="mr-2 h-4 w-4 shrink-0" aria-hidden />
          {!collapsed && <span>Sign out</span>}
        </SidebarMenuButton>
      </SidebarFooter>
    </Sidebar>
  );
}
