import { Card, CardContent } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/link-button";
import { FileQuestion } from "lucide-react";

export default function EntryNotFound() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="max-w-md w-full">
        <CardContent className="pt-8 pb-8 text-center space-y-4">
          <FileQuestion className="h-12 w-12 mx-auto text-muted-foreground" />
          <h2 className="text-xl font-bold">Entry Not Found</h2>
          <p className="text-sm text-muted-foreground">
            The learning entry you&apos;re looking for doesn&apos;t exist or has been deleted.
          </p>
          <LinkButton href="/entries">
            Back to Entries
          </LinkButton>
        </CardContent>
      </Card>
    </div>
  );
}
