import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-foreground">404</h1>
        <p className="text-muted-foreground mt-2">Page not found</p>
        <Link href="/">
          <Button className="mt-6" data-testid="button-home">
            Back to Dashboard
          </Button>
        </Link>
      </div>
    </div>
  );
}
