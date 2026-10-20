import { createFileRoute } from "@tanstack/react-router";
import { EqualizerPanel } from "@/components/equalizer-panel";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/_settings/player/equalizer")({
  component: () => (
    <Card>
      <CardContent className="pt-6">
        <EqualizerPanel />
      </CardContent>
    </Card>
  ),
});
