import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAdminUserList } from "@/hooks/useAdminUsers";
import { useSendPushNotification } from "@/hooks/useSendPushNotification";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ArrowLeft, Send, Users, User } from "lucide-react";

interface Template {
  label: string;
  title: string;
  body: string;
}

// Playful, food-delivery-app-style "guilt trip" notifications — the fun,
// slightly unhinged tone Indian delivery apps are known for. Written in
// FinTrack's own voice, not attributed to any real brand.
const TEMPLATES: Template[] = [
  { label: "🍕 Hungry nudge", title: "Bhai, kuch kha le", body: "It's been a while since your last expense entry. Coincidence, or are you starving?" },
  { label: "🛵 Guilt trip", title: "Your wallet is judging you", body: "3 unlogged expenses and counting. It's not going to log itself." },
  { label: "💸 Split reminder", title: "Someone still owes you money", body: "Don't let it slide into 'chalta hai' territory. Go settle up." },
  { label: "🎉 Weekend check-in", title: "Weekend ho gaya, kharcha bhi?", body: "Log today's spending before you forget where the money went." },
  { label: "📊 Budget nag", title: "Your budget called", body: "It says it's feeling a little... ignored this month." },
];

export default function AdminPushNotifications() {
  const navigate = useNavigate();
  const { data: users = [] } = useAdminUserList();
  const sendPush = useSendPushNotification();

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<"all" | "selected">("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const applyTemplate = (t: Template) => {
    setTitle(t.title);
    setBody(t.body);
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const canSend = title.trim() && body.trim() && (audience === "all" || selectedIds.size > 0);

  const handleSend = () => {
    if (!canSend) return;
    sendPush.mutate(
      { title: title.trim(), body: body.trim(), audience, userIds: audience === "selected" ? Array.from(selectedIds) : undefined },
      { onSuccess: () => { setTitle(""); setBody(""); setSelectedIds(new Set()); } }
    );
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center gap-2">
        <Button size="icon" variant="ghost" onClick={() => navigate("/dev")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="font-heading font-bold text-2xl">Push Notifications</h1>
      </div>

      {/* Presets */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground mb-2">Quick templates</h3>
        <div className="grid grid-cols-1 gap-2">
          {TEMPLATES.map((t) => (
            <button
              key={t.label}
              onClick={() => applyTemplate(t)}
              className="glass-card p-3 text-left hover:bg-secondary/40 transition-colors"
            >
              <p className="text-sm font-semibold">{t.label}</p>
              <p className="text-xs text-muted-foreground truncate">{t.title} — {t.body}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Custom composer */}
      <div className="glass-card p-4 space-y-3">
        <h3 className="text-sm font-semibold">Custom Notification</h3>
        <div>
          <Label>Heading</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} className="bg-secondary border-border" placeholder="Notification heading" maxLength={80} />
        </div>
        <div>
          <Label>Body</Label>
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} className="bg-secondary border-border" placeholder="Main notification text" maxLength={200} rows={3} />
        </div>
      </div>

      {/* Audience */}
      <div className="glass-card p-4 space-y-3">
        <h3 className="text-sm font-semibold">Select Audience</h3>
        <RadioGroup value={audience} onValueChange={(v) => setAudience(v as "all" | "selected")}>
          <label className="flex items-center gap-2 cursor-pointer">
            <RadioGroupItem value="all" id="aud-all" />
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">To All Users ({users.length})</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <RadioGroupItem value="selected" id="aud-selected" />
            <User className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">To Selected ({selectedIds.size})</span>
          </label>
        </RadioGroup>

        {audience === "selected" && (
          <div className="space-y-1.5 max-h-64 overflow-y-auto pt-1">
            {users.map((u) => (
              <label key={u.user_id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-secondary/40 cursor-pointer">
                <Checkbox checked={selectedIds.has(u.user_id)} onCheckedChange={() => toggleSelected(u.user_id)} />
                <span className="text-sm truncate">{u.display_name || u.email}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <Button onClick={handleSend} disabled={!canSend || sendPush.isPending} className="w-full gap-1.5">
        <Send className="h-4 w-4" /> {sendPush.isPending ? "Sending..." : "Send Notification"}
      </Button>
    </div>
  );
}
