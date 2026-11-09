import { useNavigate } from "react-router-dom";
import { useFriends } from "@/hooks/useFriends";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/EmptyState";
import { ArrowLeft, Check, X, Inbox, Clock } from "lucide-react";

export default function FriendRequests() {
  const navigate = useNavigate();
  const { incoming, outgoing, isLoading, respondRequest, cancelOrRemove } = useFriends();

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate("/settings")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="font-heading font-bold text-2xl">Friend Requests</h1>
      </div>

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      )}

      {!isLoading && (
        <>
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-muted-foreground">Pending ({incoming.length})</h2>
            {incoming.length === 0 ? (
              <EmptyState icon={Inbox} title="No pending requests" description="Requests people send you will show up here." />
            ) : (
              incoming.map((req) => (
                <div key={req.request_id} className="glass-card p-4 flex items-center gap-3">
                  <Avatar className="h-11 w-11 border border-border shrink-0">
                    <AvatarImage src={req.avatar_url || undefined} alt={req.display_name || req.username || "User"} />
                    <AvatarFallback>{(req.display_name || req.username || "U").charAt(0).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{req.display_name || req.username}</p>
                    <p className="text-xs text-muted-foreground truncate">@{req.username}</p>
                  </div>
                  <Button
                    size="icon"
                    className="bg-success text-success-foreground hover:bg-success/90 h-9 w-9 shrink-0"
                    onClick={() => respondRequest.mutate({ id: req.request_id, accept: true })}
                    title="Accept"
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="outline"
                    className="border-border text-destructive hover:text-destructive h-9 w-9 shrink-0"
                    onClick={() => respondRequest.mutate({ id: req.request_id, accept: false })}
                    title="Reject"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))
            )}
          </section>

          {outgoing.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-muted-foreground">Sent ({outgoing.length})</h2>
              {outgoing.map((req) => (
                <div key={req.request_id} className="glass-card p-4 flex items-center gap-3">
                  <Avatar className="h-11 w-11 border border-border shrink-0">
                    <AvatarImage src={req.avatar_url || undefined} alt={req.display_name || req.username || "User"} />
                    <AvatarFallback>{(req.display_name || req.username || "U").charAt(0).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{req.display_name || req.username}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" /> Waiting for response
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-border shrink-0"
                    onClick={() => cancelOrRemove.mutate(req.request_id)}
                  >
                    Cancel
                  </Button>
                </div>
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}
