import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// Teams Module Zod Schemas
// ─────────────────────────────────────────────────────────────────────────────

export const CreateRoomSchema = z.object({
  name: z
    .string({ message: "Room name is required." })
    .min(2, "Room name must be at least 2 characters.")
    .max(80, "Room name must be at most 80 characters.")
    .trim(),
});
export type CreateRoomInput = z.infer<typeof CreateRoomSchema>;

export const JoinRoomSchema = z.object({
  joinCode: z
    .string({ message: "Join code is required." })
    .length(32, "Join code must be exactly 32 characters.")
    .trim(),
});
export type JoinRoomInput = z.infer<typeof JoinRoomSchema>;

export const RoomIdParamSchema = z.object({
  id: z.string().uuid("Invalid room ID."),
});
export type RoomIdParam = z.infer<typeof RoomIdParamSchema>;
