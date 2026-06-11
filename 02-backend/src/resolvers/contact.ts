import type { GraphQLContext } from '../context';
import { requirePermission, requireAuth } from '../middleware/rbac';
import { validate, createContactSchema, updateContactSchema } from '../utils/validation';
import {
  getContacts, getContactById,
  createContact, updateContact, deleteContact,
} from '../services/contact';

export const contactResolvers = {
  Query: {
    contacts: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      await requirePermission(ctx, 'ANNUAIRE', 'READ');
      return getContacts();
    },
    contact: async (_: unknown, { id }: { id: string }, ctx: GraphQLContext) => {
      await requirePermission(ctx, 'ANNUAIRE', 'READ');
      return getContactById(id);
    },
  },

  Mutation: {
    createContact: async (
      _: unknown,
      { input }: { input: Parameters<typeof createContact>[0] },
      ctx: GraphQLContext,
    ) => {
      await requirePermission(ctx, 'ANNUAIRE', 'WRITE');
      const userId = requireAuth(ctx);
      const data = validate(createContactSchema, input);
      return createContact(data, userId, ctx.req?.ip);
    },

    updateContact: async (
      _: unknown,
      { id, input }: { id: string; input: Parameters<typeof updateContact>[1] },
      ctx: GraphQLContext,
    ) => {
      await requirePermission(ctx, 'ANNUAIRE', 'WRITE');
      const userId = requireAuth(ctx);
      const data = validate(updateContactSchema, input);
      return updateContact(id, data, userId, ctx.req?.ip);
    },

    deleteContact: async (_: unknown, { id }: { id: string }, ctx: GraphQLContext) => {
      await requirePermission(ctx, 'ANNUAIRE', 'WRITE');
      const userId = requireAuth(ctx);
      return deleteContact(id, userId, ctx.req?.ip);
    },
  },

  Contact: {
    createdAt: (parent: { createdAt: Date }) => parent.createdAt.toISOString(),
    updatedAt: (parent: { updatedAt: Date }) => parent.updatedAt.toISOString(),
  },
};
