import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { fetchAvatarCatalog, getAvatarStyles, pickRandomAvatar, type AvatarOption } from "@/lib/avatars";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/EmptyState";
import { ArrowLeft, Shuffle, Check } from "lucide-react";
import { toast } from "sonner";

export default function ChangeAvatar() {
  const navigate = useNavigate();
  const { preferences, updatePreferences } = useUserPreferences();

  const [catalog, setCatalog] = useState<AvatarOption[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<AvatarOption | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchAvatarCatalog()
      .then((data) => {
        if (!cancelled) setCatalog(data);
      })
      .catch((e: Error) => {
        if (!cancelled) setLoadError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (preferences?.avatar_url && catalog) {
      const current = catalog.find((a) => a.url === preferences.avatar_url);
      if (current) setSelected(current);
    }
  }, [preferences?.avatar_url, catalog]);

  const styles = useMemo(() => (catalog ? getAvatarStyles(catalog) : []), [catalog]);

  const filtered = useMemo(() => {
    if (!catalog) return [];
    const q = query.trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter((a) => a.style.toLowerCase().includes(q) || a.id.toLowerCase().includes(q));
  }, [catalog, query]);

  const handleRandom = () => {
    if (!catalog) return;
    const pick = pickRandomAvatar(catalog);
    if (pick) setSelected(pick);
  };

  const handleSave = () => {
    if (!selected) return;
    updatePreferences.mutate(
      { avatar_url: selected.url },
      { onSuccess: () => navigate("/settings") }
    );
  };

  return (
    <div className="max-w-2xl mx-auto space-y-5 animate-fade-in">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate("/settings")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="font-heading font-bold text-2xl">Change Avatar</h1>
      </div>

      <div className="glass-card p-6 space-y-4">
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16 border border-border">
            <AvatarImage src={selected?.url || preferences?.avatar_url || undefined} alt="Selected avatar" />
            <AvatarFallback>{(preferences?.display_name || "U").charAt(0).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{selected ? selected.id : "No avatar selected"}</p>
            <p className="text-xs text-muted-foreground">Fetched live from the alohe/avatars CDN — nothing is uploaded.</p>
          </div>
          <Button
            onClick={handleSave}
            disabled={!selected || selected.url === preferences?.avatar_url || updatePreferences.isPending}
          >
            <Check className="h-4 w-4 mr-1" /> Save
          </Button>
        </div>
      </div>

      <div className="flex gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={styles.length ? `Search styles (e.g. ${styles[0]})` : "Search styles…"}
          className="bg-secondary border-border"
        />
        <Button variant="outline" className="border-border shrink-0 gap-1" onClick={handleRandom} disabled={!catalog}>
          <Shuffle className="h-4 w-4" /> Random
        </Button>
      </div>

      {loadError && (
        <EmptyState
          title="Couldn't load avatars"
          description={loadError}
          actionLabel="Retry"
          onAction={() => {
            setLoadError(null);
            fetchAvatarCatalog()
              .then(setCatalog)
              .catch((e: Error) => setLoadError(e.message));
          }}
        />
      )}

      {!catalog && !loadError && (
        <div className="grid grid-cols-4 sm:grid-cols-5 gap-3">
          {Array.from({ length: 20 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-xl" />
          ))}
        </div>
      )}

      {catalog && filtered.length === 0 && (
        <EmptyState title="No avatars found" description={`Nothing matches "${query}".`} />
      )}

      {catalog && filtered.length > 0 && (
        <div className="grid grid-cols-4 sm:grid-cols-5 gap-3 max-h-[60vh] overflow-y-auto pr-1">
          {filtered.map((avatar) => {
            const isSelected = selected?.id === avatar.id;
            return (
              <button
                key={avatar.id}
                onClick={() => setSelected(avatar)}
                className={`relative aspect-square rounded-xl overflow-hidden border-2 transition-colors bg-secondary ${
                  isSelected ? "border-primary" : "border-transparent hover:border-border"
                }`}
                title={avatar.id}
              >
                <img src={avatar.url} alt={avatar.id} loading="lazy" className="w-full h-full object-cover" />
                {isSelected && (
                  <span className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                    <Check className="h-5 w-5 text-primary drop-shadow" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
