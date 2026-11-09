import { useState } from "react";
import { Link } from "react-router-dom";
import { useFriends, useUserSearch } from "@/hooks/useFriends";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { UserPlus, Users, Inbox, ChevronRight } from "lucide-react";

export function FriendsPanel() {
  const { friends, incoming, sendRequest, outgoing } = useFriends();
  const { query, setQuery, results, isLoading } = useUserSearch();
  const [sentTo, setSentTo] = useState<Set<string>>(new Set());

  const friendIds = new Set(friends.map((f) => f.friend_id));
  const outgoingIds = new Set(outgoing.map((r) => r.user_id));

  const handleSend = (userId: string) => {
    sendRequest.mutate(userId);
    setSentTo((prev) => new Set(prev).add(userId));
  };

  return (
    <div className="space-y-5">
      <div>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="bg-secondary border-border"
          placeholder="Search by username..."
        />
        {query.trim().length >= 2 && (
          <div className="mt-2 space-y-2">
            {isLoading && <p className="text-xs text-muted-foreground">Searching…</p>}
            {!isLoading && results.length === 0 && (
              <p className="text-xs text-muted-foreground">No users found for "{query}".</p>
            )}
            {results.map((r) => {
              const isFriend = friendIds.has(r.user_id);
              const isPending = outgoingIds.has(r.user_id) || sentTo.has(r.user_id);
              return (
                <div key={r.user_id} className="flex items-center justify-between rounded-lg bg-secondary/60 px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Avatar className="h-8 w-8 border border-border shrink-0">
                      <AvatarImage src={r.avatar_url || undefined} alt={r.display_name || r.username || "User"} />
                      <AvatarFallback>{(r.display_name || r.username || "U").charAt(0).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{r.display_name || r.username}</p>
                      <p className="text-xs text-muted-foreground truncate">@{r.username}</p>
                    </div>
                  </div>
                  {isFriend ? (
                    <Badge variant="outline" className="border-border shrink-0">Friends</Badge>
                  ) : isPending ? (
                    <Badge variant="outline" className="border-border text-muted-foreground shrink-0">Requested</Badge>
                  ) : (
                    <Button size="sm" variant="outline" className="border-border gap-1 shrink-0" onClick={() => handleSend(r.user_id)}>
                      <UserPlus className="h-3.5 w-3.5" /> Add
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Link
          to="/friends"
          className="flex items-center justify-between rounded-lg bg-secondary/60 px-3 py-3 hover:bg-secondary transition-colors"
        >
          <span className="flex items-center gap-2 text-sm font-medium">
            <Users className="h-4 w-4 text-primary" /> View All Friends
          </span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            {friends.length}
            <ChevronRight className="h-4 w-4" />
          </span>
        </Link>

        <Link
          to="/friends/requests"
          className="flex items-center justify-between rounded-lg bg-secondary/60 px-3 py-3 hover:bg-secondary transition-colors"
        >
          <span className="flex items-center gap-2 text-sm font-medium">
            <Inbox className="h-4 w-4 text-primary" /> Friend Requests
          </span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            {incoming.length > 0 && <Badge className="bg-primary text-primary-foreground">{incoming.length}</Badge>}
            <ChevronRight className="h-4 w-4" />
          </span>
        </Link>
      </div>
    </div>
  );
}
