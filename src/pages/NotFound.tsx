import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Home } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="text-center animate-fade-in">
        <p className="text-7xl font-bold gradient-text font-heading mb-4">404</p>
        <h1 className="text-2xl font-heading font-semibold mb-2">Page not found</h1>
        <p className="text-muted-foreground mb-6">The page you're looking for doesn't exist.</p>
        <Button asChild>
          <Link to="/">
            <Home className="h-4 w-4 mr-2" /> Back to Dashboard
          </Link>
        </Button>
      </div>
    </div>
  );
}
