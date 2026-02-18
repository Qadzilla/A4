import { z } from 'zod';

export const anchorPositionSchema = z.enum(['top', 'bottom', 'left', 'right']);

export const canvasItemSchema = z.object({
  id: z.string().uuid(),
  type: z.string(),
  name: z.string(),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  zIndex: z.number(),
  data: z.record(z.unknown()).optional(),
});

export const canvasConnectionSchema = z.object({
  id: z.string().uuid(),
  fromItemId: z.string().uuid(),
  fromAnchor: anchorPositionSchema,
  toItemId: z.string().uuid(),
  toAnchor: anchorPositionSchema,
});

export const saveCanvasSchema = z.object({
  workspaceId: z.string().uuid(),
  items: z.array(canvasItemSchema),
  connections: z.array(canvasConnectionSchema),
});
