import { GraphQLError } from 'graphql';
import type { GraphQLContext } from '../context';
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
      return createTag(name, color, ctx.userId);
    },

    deleteTag: async (_: unknown, { id }: { id: string }, ctx: GraphQLContext) => {
      if (!ctx.userId) throw new GraphQLError('Non authentifié', { extensions: { code: 'UNAUTHENTICATED' } });
      return deleteTag(id, ctx.userId);
    },
  },
};
