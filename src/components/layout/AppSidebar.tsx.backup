import { NavLink } from "@/components/NavLink";
import { LayoutDashboard, ArrowLeftRight, PiggyBank, BarChart3, Settings, LogOut, Wallet, Handshake, Users, MessageCircle, ShieldCheck } from "lucide-react";
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
  { title: "Debt Tracker", url: "/debt", icon: Handshake },
  { title: "Chat", url: "/chat", icon: MessageCircle },
  { title: "Reports", url: "/reports", icon: BarChart3 },
  { title: "Budgets", url: "/budgets", icon: PiggyBank },
  { title: "Settings", url: "/settings", icon: Settings },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { signOut } = useAuth();
  const unreadCount = useUnreadCount();
  const { isDeveloper } = useIsDeveloper();

  return (
    <Sidebar collapsible="icon" className="border-r border-border bg-sidebar">
      <div className="p-4 flex items-center gap-2">
        <div className="p-2 rounded-lg bg-primary/10 shrink-0">
          <Wallet className="h-5 w-5 text-primary" />
        </div>
        {!collapsed && <span className="font-heading font-bold text-lg gradient-text">FinTrack</span>}
      </div>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === "/"}
                      className="hover:bg-sidebar-accent"
                      activeClassName="bg-sidebar-accent text-primary font-medium"
                    >
                      <item.icon className="mr-2 h-4 w-4 shrink-0" />
                      {!collapsed && <span className="flex-1">{item.title}</span>}
                      {!collapsed && item.title === "Chat" && unreadCount > 0 && (
                        <Badge className="bg-primary text-primary-foreground h-5 min-w-5 px-1 flex items-center justify-center text-[10px]">
                          {unreadCount > 9 ? "9+" : unreadCount}
                        </Badge>
                      )}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink
                    to="/split"
                    className="hover:bg-sidebar-accent"
                    activeClassName="bg-sidebar-accent text-primary font-medium"
                  >
                    <Users className="mr-2 h-4 w-4 shrink-0" />
                    {!collapsed && <span>Split</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {isDeveloper && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink to="/dev" className="hover:bg-sidebar-accent" activeClassName="bg-sidebar-accent text-primary font-medium">
                      <ShieldCheck className="mr-2 h-4 w-4 shrink-0" />
                      {!collapsed && <span>Developer</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-2">
        <SidebarMenuButton
          onClick={signOut}
          className="hover:bg-sidebar-accent text-muted-foreground cursor-pointer"
        >
          <LogOut className="mr-2 h-4 w-4 shrink-0" />
          {!collapsed && <span>Sign Out</span>}
        </SidebarMenuButton>
      </SidebarFooter>
    </Sidebar>
  );
}
