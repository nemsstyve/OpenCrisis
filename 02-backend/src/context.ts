import type { Request, Response } from 'express';

export interface GraphQLContext {
  userId: string | null;
  req: Request | null;
  res: Response | null;
}
