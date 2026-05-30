import { GraphQLError } from 'graphql';
import type { GraphQLContext } from '../context';
import { requirePermission } from '../middleware/rbac';
import {
  getContacts, getContactById,
  createContact, updateContact, deleteContact,
  linkContactToIncident, unlinkContactFromIncident,
} from '../services/contact';

export const contactResolvers = {
  Query: {
    contacts: async (_: unknown, { incidentId }: { incidentId?: string }, ctx: GraphQLContext) => {
      await requirePermission(ctx, 'ANNUAIRE', 'READ');
      return getContacts(incidentId);
    },
    contact: async (_: unknown, { id }: { id: string }, ctx: GraphQLContext) => {
      await requirePermission(ctx, 'ANNUAIRE', 'READ');
      return getContactById(id);
    },
  },

  Mutation: {
    createContact: async (
      _: unknown,
      { input, incidentId }: { input: Parameters<typeof createContact>[0]; incidentId?: string },
      ctx: GraphQLContext,
    ) => {
      await requirePermission(ctx, 'ANNUAIRE', 'WRITE');
      if (!ctx.userId) throw new GraphQLError('Non authentifié', { extensions: { code: 'UNAUTHENTICATED' } });
      return createContact(input, ctx.userId, incidentId, ctx.req?.ip);
    },

    updateContact: async (
      _: unknown,
      { id, input }: { id: string; input: Parameters<typeof updateContact>[1] },
      ctx: GraphQLContext,
    ) => {
      await requirePermission(ctx, 'ANNUAIRE', 'WRITE');
      if (!ctx.userId) throw new GraphQLError('Non authentifié', { extensions: { code: 'UNAUTHENTICATED' } });
      return updateContact(id, input, ctx.userId, ctx.req?.ip);
    },

    deleteContact: async (_: unknown, { id }: { id: string }, ctx: GraphQLContext) => {
      await requirePermission(ctx, 'ANNUAIRE', 'WRITE');
      if (!ctx.userId) throw new GraphQLError('Non authentifié', { extensions: { code: 'UNAUTHENTICATED' } });
      return deleteContact(id, ctx.userId, ctx.req?.ip);
    },

    linkContactToIncident: async (
      _: unknown,
      { contactId, incidentId }: { contactId: string; incidentId: string },
      ctx: GraphQLContext,
    ) => {
      await requirePermission(ctx, 'ANNUAIRE', 'WRITE');
      if (!ctx.userId) throw new GraphQLError('Non authentifié', { extensions: { code: 'UNAUTHENTICATED' } });
      return linkContactToIncident(contactId, incidentId, ctx.userId);
    },

    unlinkContactFromIncident: async (
      _: unknown,
      { contactId, incidentId }: { contactId: string; incidentId: string },
      ctx: GraphQLContext,
    ) => {
      await requirePermission(ctx, 'ANNUAIRE', 'WRITE');
      if (!ctx.userId) throw new GraphQLError('Non authentifié', { extensions: { code: 'UNAUTHENTICATED' } });
      return unlinkContactFromIncident(contactId, incidentId, ctx.userId);
    },
  },

  Contact: {
    createdAt: (parent: { createdAt: Date }) => parent.createdAt.toISOString(),
    updatedAt: (parent: { updatedAt: Date }) => parent.updatedAt.toISOString(),
  },
};
