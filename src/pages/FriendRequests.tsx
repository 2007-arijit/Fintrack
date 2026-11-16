import { useNavigate } from "react-router-dom";
import { useFriends } from "@/hooks/useFriends";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { Check, X, Inbox, Clock } from "lucide-react";

export default function FriendRequests() {
  const navigate = useNavigate();
  const { incoming, outgoing, isLoading, respondRequest, cancelOrRemove } = useFriends();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        backTo="/settings"
        backLabel="Settings"
        eyebrow="People"
        title="Friend requests"
        description="Accept people you know, or keep track of requests you've already sent."
      />

      {isLoading && (
        <div className="space-y-2" aria-busy="true">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[68px] rounded-2xl" />
          ))}
        </div>
      )}

      {!isLoading && (
        <>
          <section className="space-y-3" aria-labelledby="incoming-requests">
            <h2 id="incoming-requests" className="eyebrow flex items-center gap-2">
              Pending
              <span className="tabular text-muted-foreground">({incoming.length})</span>
            </h2>

            {incoming.length === 0 ? (
              <div className="glass-card">
                <EmptyState
                  icon={Inbox}
                  title="No pending requests"
                  description="Requests people send you will show up here."
                />
              </div>
            ) : (
              <div className="glass-card divide-y divide-border/60 overflow-hidden">
                {incoming.map((req) => (
                  <div key={req.request_id} className="flex items-center gap-3 p-3.5 sm:p-4">
                    <Avatar className="h-10 w-10 shrink-0 border border-border">
                      <AvatarImage src={req.avatar_url || undefined} alt={req.display_name || req.username || "User"} />
                      <AvatarFallback>{(req.display_name || req.username || "U").charAt(0).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{req.display_name || req.username}</p>
                      <p className="truncate text-[11px] text-muted-foreground">@{req.username}</p>
                    </div>
                    <Button
                      size="icon"
                      className="h-8 w-8 shrink-0 bg-success text-success-foreground hover:bg-success/90"
                      onClick={() => respondRequest.mutate({ id: req.request_id, accept: true })}
                      aria-label={`Accept request from ${req.display_name || req.username}`}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-8 w-8 shrink-0 border-border text-muted-foreground hover:text-destructive"
                      onClick={() => respondRequest.mutate({ id: req.request_id, accept: false })}
                      aria-label={`Decline request from ${req.display_name || req.username}`}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {outgoing.length > 0 && (
            <section className="space-y-3" aria-labelledby="sent-requests">
              <h2 id="sent-requests" className="eyebrow flex items-center gap-2">
                Sent
                <span className="tabular text-muted-foreground">({outgoing.length})</span>
              </h2>
              <div className="glass-card divide-y divide-border/60 overflow-hidden">
                {outgoing.map((req) => (
                  <div key={req.request_id} className="flex items-center gap-3 p-3.5 sm:p-4">
                    <Avatar className="h-10 w-10 shrink-0 border border-border">
                      <AvatarImage src={req.avatar_url || undefined} alt={req.display_name || req.username || "User"} />
                      <AvatarFallback>{(req.display_name || req.username || "U").charAt(0).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{req.display_name || req.username}</p>
                      <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Clock className="h-3 w-3" aria-hidden="true" /> Waiting for response
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 shrink-0 px-2 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => cancelOrRemove.mutate(req.request_id)}
                    >
                      Cancel
                    </Button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
