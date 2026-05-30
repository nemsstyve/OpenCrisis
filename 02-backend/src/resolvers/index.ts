import { authResolvers } from './auth';
import { incidentResolvers } from './incident';
import { logEntryResolvers } from './logEntry';
import { tagResolvers } from './tag';
import { timelineResolvers } from './timeline';
import { documentResolvers } from './document';
import { contactResolvers } from './contact';

export const resolvers = [
  authResolvers,
  incidentResolvers,
  logEntryResolvers,
  tagResolvers,
  timelineResolvers,
  documentResolvers,
  contactResolvers,
];
