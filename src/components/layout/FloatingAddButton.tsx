import { useLocation } from "react-router-dom";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

const SHOW_ON = ["/", "/transactions"];

export function FloatingAddButton() {
  const location = useLocation();
  if (!SHOW_ON.includes(location.pathname)) return null;

  const handleClick = () => {
    window.dispatchEvent(new CustomEvent("floating-add-click"));
  };

  return (
    <Button
      onClick={handleClick}
      size="icon"
      className="md:hidden fixed z-[9998] right-4 h-12 w-12 rounded-full shadow-lg bg-primary text-primary-foreground"
      style={{ bottom: "calc(72px + env(safe-area-inset-bottom, 0px) + 16px)" }}
    >
      <Plus className="h-6 w-6" />
    </Button>
  );
}
