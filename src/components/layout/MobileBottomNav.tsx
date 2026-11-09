import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard, ArrowLeftRight, ShieldAlert, Users, Menu, Handshake, MessageCircle, PiggyBank, BarChart3, Settings,
} from "lucide-react";
import { useUnreadCount } from "@/hooks/useChat";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const PRIMARY = [
  { title: "Home", url: "/", icon: LayoutDashboard },
  { title: "Transactions", url: "/transactions", icon: ArrowLeftRight },
  { title: "PayShield", url: "/payshield", icon: ShieldAlert },
  { title: "Split", url: "/split", icon: Users },
];
const MORE = [
  { title: "Debt Tracker", url: "/debt", icon: Handshake },
  { title: "Chat", url: "/chat", icon: MessageCircle },
  { title: "Budgets", url: "/budgets", icon: PiggyBank },
  { title: "Reports", url: "/reports", icon: BarChart3 },
  { title: "Settings", url: "/settings", icon: Settings },
];

const isActive = (path: string, url: string) => (url === "/" ? path === "/" : path.startsWith(url));
const itemClass = (active: boolean) =>
  cn("relative flex min-h-[48px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors",
    active ? "text-primary" : "text-muted-foreground");

export function MobileBottomNav() {
  const { pathname } = useLocation();
  const unread = useUnreadCount();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = MORE.some((m) => isActive(pathname, m.url));

  return (
    <>
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card md:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        <div className="flex">
          {PRIMARY.map((item) => {
            const active = isActive(pathname, item.url);
            return (
              <Link key={item.url} to={item.url} aria-current={active ? "page" : undefined} className={itemClass(active)}>
                {active && <span aria-hidden className="absolute top-0 h-0.5 w-8 rounded-full bg-primary" />}
                <item.icon className="h-5 w-5" aria-hidden />
                <span>{item.title}</span>
              </Link>
            );
          })}
          <button type="button" onClick={() => setMoreOpen(true)} aria-haspopup="dialog" className={itemClass(moreActive)}>
            {moreActive && <span aria-hidden className="absolute top-0 h-0.5 w-8 rounded-full bg-primary" />}
            <span className="relative">
              <Menu className="h-5 w-5" aria-hidden />
              {unread > 0 && <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-primary" aria-hidden />}
            </span>
            <span>More{unread > 0 ? ", unread messages" : ""}</span>
          </button>
        </div>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]">
          <SheetHeader><SheetTitle className="text-left">More</SheetTitle></SheetHeader>
          <ul className="mt-3 grid gap-1">
            {MORE.map((item) => (
              <li key={item.url}>
                <Link to={item.url} onClick={() => setMoreOpen(false)} aria-current={isActive(pathname, item.url) ? "page" : undefined}
                  className={cn("flex min-h-[48px] items-center gap-3 rounded-lg px-3 text-sm font-medium hover:bg-accent", isActive(pathname, item.url) && "bg-accent text-primary")}>
                  <item.icon className="h-5 w-5" aria-hidden />
                  <span className="flex-1">{item.title}</span>
                  {item.title === "Chat" && unread > 0 && <span className="rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">{unread > 9 ? "9+" : unread}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </SheetContent>
      </Sheet>
    </>
  );
}
