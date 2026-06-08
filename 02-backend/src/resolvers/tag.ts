import { GraphQLError } from 'graphql';
import type { GraphQLContext } from '../context';
import { hasPermission, requireAuth } from '../middleware/rbac';
import { validate, createTagSchema } from '../utils/validation';
import { getTags, createTag, deleteTag } from '../services/tag';

export const tagResolvers = {
  Query: {
    tags: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      requireAuth(ctx);
      return getTags();
    },
  },

  Mutation: {
    createTag: async (
      _: unknown,
      { name, color }: { name: string; color?: string },
      ctx: GraphQLContext,
    ) => {
      const userId = requireAuth(ctx);
      // Un tag est utilisé dans la main courante : WRITE sur au moins une cellule requis
      const canWrite =
        await hasPermission(ctx, 'MAIN_COURANTE_DIR', 'WRITE') ||
        await hasPermission(ctx, 'MAIN_COURANTE_OPS', 'WRITE');
      if (!canWrite) throw new GraphQLError('Permission refusée', { extensions: { code: 'FORBIDDEN' } });
      const data = validate(createTagSchema, { name, color });
      return createTag(data.name, data.color, userId);
    },

    deleteTag: async (_: unknown, { id }: { id: string }, ctx: GraphQLContext) => {
      const userId = requireAuth(ctx);
      const canWrite =
        await hasPermission(ctx, 'MAIN_COURANTE_DIR', 'WRITE') ||
        await hasPermission(ctx, 'MAIN_COURANTE_OPS', 'WRITE');
      if (!canWrite) throw new GraphQLError('Permission refusée', { extensions: { code: 'FORBIDDEN' } });
      return deleteTag(id, userId);
    },
  },
};
