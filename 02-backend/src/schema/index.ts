import { authTypeDefs } from './auth';
import { incidentTypeDefs } from './incident';
import { logEntryTypeDefs } from './logEntry';
import { tagTypeDefs } from './tag';
import { timelineTypeDefs } from './timeline';
import { documentTypeDefs } from './document';
import { contactTypeDefs } from './contact';

// Base types — étendu par chaque module
const baseTypeDefs = `#graphql
  type Query
  type Mutation
`;

export const typeDefs = [
  baseTypeDefs,
  authTypeDefs,
  incidentTypeDefs,
  logEntryTypeDefs,
  tagTypeDefs,
  timelineTypeDefs,
  documentTypeDefs,
  contactTypeDefs,
];
