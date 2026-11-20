import { authTypeDefs } from './auth';
import { incidentTypeDefs } from './incident';
import { incidentProposalTypeDefs } from './incidentProposal';
import { logEntryTypeDefs } from './logEntry';
import { tagTypeDefs } from './tag';
import { timelineTypeDefs } from './timeline';
import { documentTypeDefs } from './document';
import { contactTypeDefs } from './contact';
import { adminTypeDefs } from './admin';
import { wazuhConnectorTypeDefs } from './wazuhConnector';
import { openctiTypeDefs } from './opencti';
import { sharedThreatTypeDefs } from './sharedThreat';

// Base types — étendu par chaque module
const baseTypeDefs = `#graphql
  type Query
  type Mutation
`;

export const typeDefs = [
  baseTypeDefs,
  authTypeDefs,
  incidentTypeDefs,
  incidentProposalTypeDefs,
  logEntryTypeDefs,
  tagTypeDefs,
  timelineTypeDefs,
  documentTypeDefs,
  contactTypeDefs,
  adminTypeDefs,
  wazuhConnectorTypeDefs,
  openctiTypeDefs,
  sharedThreatTypeDefs,
];
