import { Link } from "react-router-dom";
import { Handshake, Plus, ShieldCheck, Users, type LucideIcon } from "lucide-react";

const tileClass = "surface surface-interactive flex min-h-[56px] items-center gap-3 p-3 text-left text-sm font-medium";

function Tile({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <>
      <span className="rounded-lg bg-secondary p-2 text-secondary-foreground"><Icon className="h-4 w-4" aria-hidden /></span>
      <span>{label}</span>
    </>
  );
}

/** Shortcuts to things that exist today. Add transaction opens the modal owned by the page. */
export function QuickActions({ onAddTransaction }: { onAddTransaction: () => void }) {
  return (
    <nav aria-label="Quick actions" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <button type="button" onClick={onAddTransaction} className={tileClass}><Tile icon={Plus} label="Add transaction" /></button>
      <Link to="/payshield" className={tileClass}><Tile icon={ShieldCheck} label="Check with PayShield" /></Link>
      <Link to="/split" className={tileClass}><Tile icon={Users} label="Split an expense" /></Link>
      <Link to="/debt" className={tileClass}><Tile icon={Handshake} label="Track a debt" /></Link>
    </nav>
  );
}
