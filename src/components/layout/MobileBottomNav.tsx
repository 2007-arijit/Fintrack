import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  ArrowLeftRight,
  Handshake,
  MessageCircle,
  PiggyBank,
  ShieldAlert,
  Users,
} from "lucide-react";
import { useUnreadCount } from "@/hooks/useChat";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { title: "Home", url: "/", icon: LayoutDashboard },
  { title: "Txns", url: "/transactions", icon: ArrowLeftRight },
  { title: "Debt", url: "/debt", icon: Handshake },
  { title: "Split", url: "/split", icon: Users },
  { title: "Chat", url: "/chat", icon: MessageCircle },
  { title: "Budget", url: "/budgets", icon: PiggyBank },
  { title: "Shield", url: "/payshield", icon: ShieldAlert },
];

export function MobileBottomNav() {
  const location = useLocation();
  const unreadCount = useUnreadCount();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-[9999] border-t border-border/70 bg-card/90 backdrop-blur-xl md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      aria-label="Primary navigation"
    >
      <div className="flex items-stretch justify-around py-1">
        {NAV_ITEMS.map((item) => {
          const active =
            item.url === "/" ? location.pathname === "/" : location.pathname.startsWith(item.url);
          return (
            <Link
              key={item.title}
              to={item.url}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex flex-1 flex-col items-center gap-0.5 px-0.5 py-1 text-[9px] font-medium transition-colors duration-200 active:scale-95",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "relative flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
                  active && "bg-primary/12",
                )}
              >
                <item.icon className="h-[18px] w-[18px]" aria-hidden="true" />
                {item.title === "Chat" && unreadCount > 0 && (
                  <Badge className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center bg-primary px-1 text-[9px] text-primary-foreground">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </Badge>
                )}
              </span>
              <span className="truncate">{item.title}</span>
              <span
                className={cn(
                  "h-0.5 w-0.5 rounded-full transition-opacity",
                  active ? "bg-primary opacity-100" : "opacity-0",
                )}
                aria-hidden="true"
              />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
