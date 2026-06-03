import { GraphQLError } from 'graphql';
import type { GraphQLContext } from '../context';
import { hasPermission } from '../middleware/rbac';
import { getTags, createTag, deleteTag } from '../services/tag';

export const tagResolvers = {
  Query: {
    tags: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      if (!ctx.userId) throw new GraphQLError('Non authentifié', { extensions: { code: 'UNAUTHENTICATED' } });
      return getTags();
    },
  },

  Mutation: {
    createTag: async (
      _: unknown,
      { name, color }: { name: string; color?: string },
      ctx: GraphQLContext,
    ) => {
      if (!ctx.userId) throw new GraphQLError('Non authentifié', { extensions: { code: 'UNAUTHENTICATED' } });
      // Un tag est utilisé dans la main courante : WRITE sur au moins une cellule requis
      const canWrite =
        await hasPermission(ctx, 'MAIN_COURANTE_DIR', 'WRITE') ||
        await hasPermission(ctx, 'MAIN_COURANTE_OPS', 'WRITE');
      if (!canWrite) throw new GraphQLError('Permission refusée', { extensions: { code: 'FORBIDDEN' } });
      return createTag(name, color, ctx.userId);
    },

    deleteTag: async (_: unknown, { id }: { id: string }, ctx: GraphQLContext) => {
      if (!ctx.userId) throw new GraphQLError('Non authentifié', { extensions: { code: 'UNAUTHENTICATED' } });
      const canWrite =
        await hasPermission(ctx, 'MAIN_COURANTE_DIR', 'WRITE') ||
        await hasPermission(ctx, 'MAIN_COURANTE_OPS', 'WRITE');
      if (!canWrite) throw new GraphQLError('Permission refusée', { extensions: { code: 'FORBIDDEN' } });
      return deleteTag(id, ctx.userId);
    },
  },
};
