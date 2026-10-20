import { PLAYER_PROCEDURES } from "@shared/skins/access";
const players = new Set<number>();
export function registerPlayer(id: number) {
  players.add(id);
  return () => players.delete(id);
}
export function isPlayerSender(sender: unknown): boolean {
  return !!sender && typeof sender === "object" && players.has((sender as { id: number }).id);
}
export function authorizePlayer(sender: unknown, path: string) {
  if (isPlayerSender(sender) && !PLAYER_PROCEDURES.has(path))
    throw new Error("This action is not available in player mode.");
}
