import { authResolvers } from './auth';
import { incidentResolvers } from './incident';
import { incidentProposalResolvers } from './incidentProposal';
import { logEntryResolvers } from './logEntry';
import { tagResolvers } from './tag';
import { timelineResolvers } from './timeline';
import { documentResolvers } from './document';
import { contactResolvers } from './contact';
import { adminResolvers } from './admin';
import { wazuhConnectorResolvers } from './wazuhConnector';
import { openctiResolvers } from './opencti';
import { sharedThreatResolvers } from './sharedThreat';

export const resolvers = [
  authResolvers,
  incidentResolvers,
  incidentProposalResolvers,
  logEntryResolvers,
  tagResolvers,
  timelineResolvers,
  documentResolvers,
  contactResolvers,
  adminResolvers,
  wazuhConnectorResolvers,
  openctiResolvers,
  sharedThreatResolvers,
];
