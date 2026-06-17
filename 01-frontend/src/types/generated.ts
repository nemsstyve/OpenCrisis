export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
};

export type GqlAdminCreateRoleInput = {
  description?: InputMaybe<Scalars['String']['input']>;
  name: Scalars['String']['input'];
  permissionIds: Array<Scalars['ID']['input']>;
};

export type GqlAdminCreateUserInput = {
  company?: InputMaybe<Scalars['String']['input']>;
  email: Scalars['String']['input'];
  firstName: Scalars['String']['input'];
  lastName: Scalars['String']['input'];
  password: Scalars['String']['input'];
  phone?: InputMaybe<Scalars['String']['input']>;
  site?: InputMaybe<Scalars['String']['input']>;
};

export type GqlAdminUpdateUserInput = {
  company?: InputMaybe<Scalars['String']['input']>;
  firstName?: InputMaybe<Scalars['String']['input']>;
  isActive?: InputMaybe<Scalars['Boolean']['input']>;
  lastName?: InputMaybe<Scalars['String']['input']>;
  phone?: InputMaybe<Scalars['String']['input']>;
  site?: InputMaybe<Scalars['String']['input']>;
};

export type GqlAuditLogEntry = {
  action: Scalars['String']['output'];
  createdAt: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  incidentId?: Maybe<Scalars['String']['output']>;
  ipAddress?: Maybe<Scalars['String']['output']>;
  metadata?: Maybe<Scalars['String']['output']>;
  resource: Scalars['String']['output'];
  resourceId?: Maybe<Scalars['String']['output']>;
  user?: Maybe<GqlAuditLogUser>;
};

export type GqlAuditLogPage = {
  items: Array<GqlAuditLogEntry>;
  total: Scalars['Int']['output'];
};

export type GqlAuditLogUser = {
  email: Scalars['String']['output'];
  firstName: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  lastName: Scalars['String']['output'];
};

export type GqlAuthPayload = {
  accessToken: Scalars['String']['output'];
  user: GqlUser;
};

export type GqlCell =
  | 'DIRECTIONAL'
  | 'OPERATIONAL'
  | 'SHARED';

export type GqlContact = {
  createdAt: Scalars['String']['output'];
  email?: Maybe<Scalars['String']['output']>;
  firstName: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  lastName: Scalars['String']['output'];
  notes?: Maybe<Scalars['String']['output']>;
  organization?: Maybe<Scalars['String']['output']>;
  phone?: Maybe<Scalars['String']['output']>;
  role: Scalars['String']['output'];
  site?: Maybe<Scalars['String']['output']>;
  updatedAt: Scalars['String']['output'];
};

export type GqlCreateContactInput = {
  email?: InputMaybe<Scalars['String']['input']>;
  firstName: Scalars['String']['input'];
  lastName: Scalars['String']['input'];
  notes?: InputMaybe<Scalars['String']['input']>;
  organization?: InputMaybe<Scalars['String']['input']>;
  phone?: InputMaybe<Scalars['String']['input']>;
  role: Scalars['String']['input'];
  site?: InputMaybe<Scalars['String']['input']>;
};

export type GqlCreateIncidentInput = {
  description?: InputMaybe<Scalars['String']['input']>;
  name: Scalars['String']['input'];
  severity?: InputMaybe<GqlSeverity>;
};

export type GqlCreateTimelineEventInput = {
  actorId?: InputMaybe<Scalars['ID']['input']>;
  affectedUser?: InputMaybe<Scalars['String']['input']>;
  assetName?: InputMaybe<Scalars['String']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  ioc?: InputMaybe<Scalars['String']['input']>;
  ipAddress?: InputMaybe<Scalars['String']['input']>;
  isFirstDetection?: InputMaybe<Scalars['Boolean']['input']>;
  occurredAt: Scalars['String']['input'];
  title: Scalars['String']['input'];
  type: GqlTimelineEventType;
};

export type GqlDocument = {
  category: GqlDocumentCategory;
  createdAt: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  incidentId?: Maybe<Scalars['ID']['output']>;
  mimeType: Scalars['String']['output'];
  name: Scalars['String']['output'];
  sizeBytes: Scalars['Int']['output'];
  timelineEventId?: Maybe<Scalars['ID']['output']>;
  uploadedBy: GqlUser;
};

export type GqlDocumentCategory =
  | 'ARTIFACT'
  | 'FICHE_REFLEXE'
  | 'OTHER'
  | 'PROCEDURE'
  | 'RAPPORT';

export type GqlIncident = {
  createdAt: Scalars['String']['output'];
  createdBy: GqlUser;
  description?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  openctiCaseId?: Maybe<Scalars['String']['output']>;
  resolvedAt?: Maybe<Scalars['String']['output']>;
  severity: GqlSeverity;
  startedAt: Scalars['String']['output'];
  status: GqlIncidentStatus;
  updatedAt: Scalars['String']['output'];
};

export type GqlIncidentStatus =
  | 'ACTIVE'
  | 'CLOSED'
  | 'CONTAINED';

export type GqlLogEntry = {
  author: GqlUser;
  cell: GqlCell;
  content: Scalars['String']['output'];
  createdAt: Scalars['String']['output'];
  editedAt?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  incidentId: Scalars['ID']['output'];
  isEdited: Scalars['Boolean']['output'];
  tags: Array<GqlTag>;
  updatedAt: Scalars['String']['output'];
};

export type GqlMutation = {
  addTagToLogEntry: GqlLogEntry;
  adminAssignRole: Scalars['Boolean']['output'];
  adminCreateRole: GqlRoleDetail;
  adminCreateUser: GqlUser;
  adminDeleteRole: Scalars['Boolean']['output'];
  adminDeleteUser: Scalars['Boolean']['output'];
  adminRemoveRole: Scalars['Boolean']['output'];
  adminResetPassword: Scalars['Boolean']['output'];
  adminUpdateRolePermissions: GqlRoleDetail;
  adminUpdateUser: GqlUser;
  changePassword: Scalars['Boolean']['output'];
  createContact: GqlContact;
  createIncident: GqlIncident;
  createLogEntry: GqlLogEntry;
  createTag: GqlTag;
  createTimelineEvent: GqlTimelineEvent;
  deleteContact: Scalars['Boolean']['output'];
  deleteDocument: Scalars['Boolean']['output'];
  deleteIncident: Scalars['Boolean']['output'];
  deleteLogEntry: Scalars['Boolean']['output'];
  deleteTag: Scalars['Boolean']['output'];
  deleteTimelineEvent: Scalars['Boolean']['output'];
  editLogEntry: GqlLogEntry;
  login: GqlAuthPayload;
  logout: Scalars['Boolean']['output'];
  refreshToken: GqlAuthPayload;
  removeTagFromLogEntry: GqlLogEntry;
  updateContact: GqlContact;
  updateIncident: GqlIncident;
  updateTimelineEvent: GqlTimelineEvent;
};


export type GqlMutationAddTagToLogEntryArgs = {
  logEntryId: Scalars['ID']['input'];
  tagId: Scalars['ID']['input'];
};


export type GqlMutationAdminAssignRoleArgs = {
  roleId: Scalars['ID']['input'];
  userId: Scalars['ID']['input'];
};


export type GqlMutationAdminCreateRoleArgs = {
  input: GqlAdminCreateRoleInput;
};


export type GqlMutationAdminCreateUserArgs = {
  input: GqlAdminCreateUserInput;
  roleIds?: InputMaybe<Array<Scalars['ID']['input']>>;
};


export type GqlMutationAdminDeleteRoleArgs = {
  id: Scalars['ID']['input'];
};


export type GqlMutationAdminDeleteUserArgs = {
  id: Scalars['ID']['input'];
};


export type GqlMutationAdminRemoveRoleArgs = {
  roleId: Scalars['ID']['input'];
  userId: Scalars['ID']['input'];
};


export type GqlMutationAdminResetPasswordArgs = {
  newPassword: Scalars['String']['input'];
  userId: Scalars['ID']['input'];
};


export type GqlMutationAdminUpdateRolePermissionsArgs = {
  permissionIds: Array<Scalars['ID']['input']>;
  roleId: Scalars['ID']['input'];
};


export type GqlMutationAdminUpdateUserArgs = {
  id: Scalars['ID']['input'];
  input: GqlAdminUpdateUserInput;
};


export type GqlMutationChangePasswordArgs = {
  currentPassword: Scalars['String']['input'];
  newPassword: Scalars['String']['input'];
};


export type GqlMutationCreateContactArgs = {
  input: GqlCreateContactInput;
};


export type GqlMutationCreateIncidentArgs = {
  input: GqlCreateIncidentInput;
};


export type GqlMutationCreateLogEntryArgs = {
  cell: GqlCell;
  content: Scalars['String']['input'];
  incidentId: Scalars['ID']['input'];
};


export type GqlMutationCreateTagArgs = {
  color?: InputMaybe<Scalars['String']['input']>;
  name: Scalars['String']['input'];
};


export type GqlMutationCreateTimelineEventArgs = {
  incidentId: Scalars['ID']['input'];
  input: GqlCreateTimelineEventInput;
};


export type GqlMutationDeleteContactArgs = {
  id: Scalars['ID']['input'];
};


export type GqlMutationDeleteDocumentArgs = {
  id: Scalars['ID']['input'];
};


export type GqlMutationDeleteIncidentArgs = {
  id: Scalars['ID']['input'];
};


export type GqlMutationDeleteLogEntryArgs = {
  id: Scalars['ID']['input'];
};


export type GqlMutationDeleteTagArgs = {
  id: Scalars['ID']['input'];
};


export type GqlMutationDeleteTimelineEventArgs = {
  id: Scalars['ID']['input'];
};


export type GqlMutationEditLogEntryArgs = {
  content: Scalars['String']['input'];
  id: Scalars['ID']['input'];
};


export type GqlMutationLoginArgs = {
  email: Scalars['String']['input'];
  password: Scalars['String']['input'];
};


export type GqlMutationRemoveTagFromLogEntryArgs = {
  logEntryId: Scalars['ID']['input'];
  tagId: Scalars['ID']['input'];
};


export type GqlMutationUpdateContactArgs = {
  id: Scalars['ID']['input'];
  input: GqlUpdateContactInput;
};


export type GqlMutationUpdateIncidentArgs = {
  id: Scalars['ID']['input'];
  input: GqlUpdateIncidentInput;
};


export type GqlMutationUpdateTimelineEventArgs = {
  id: Scalars['ID']['input'];
  input: GqlUpdateTimelineEventInput;
};

export type GqlPermission = {
  action: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  resource: Scalars['String']['output'];
};

export type GqlQuery = {
  adminAuditLogs: GqlAuditLogPage;
  adminPermissions: Array<GqlPermission>;
  adminRoles: Array<GqlRoleDetail>;
  adminUsers: Array<GqlUser>;
  contact?: Maybe<GqlContact>;
  contacts: Array<GqlContact>;
  document?: Maybe<GqlDocument>;
  documents: Array<GqlDocument>;
  incident?: Maybe<GqlIncident>;
  incidents: Array<GqlIncident>;
  logEntries: Array<GqlLogEntry>;
  me?: Maybe<GqlUser>;
  tags: Array<GqlTag>;
  timelineEvent?: Maybe<GqlTimelineEvent>;
  timelineEvents: Array<GqlTimelineEvent>;
};


export type GqlQueryAdminAuditLogsArgs = {
  incidentId?: InputMaybe<Scalars['ID']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
};


export type GqlQueryContactArgs = {
  id: Scalars['ID']['input'];
};


export type GqlQueryDocumentArgs = {
  id: Scalars['ID']['input'];
};


export type GqlQueryDocumentsArgs = {
  category?: InputMaybe<GqlDocumentCategory>;
  incidentId?: InputMaybe<Scalars['ID']['input']>;
};


export type GqlQueryIncidentArgs = {
  id: Scalars['ID']['input'];
};


export type GqlQueryLogEntriesArgs = {
  cell?: InputMaybe<GqlCell>;
  incidentId: Scalars['ID']['input'];
};


export type GqlQueryTimelineEventArgs = {
  id: Scalars['ID']['input'];
};


export type GqlQueryTimelineEventsArgs = {
  incidentId: Scalars['ID']['input'];
};

export type GqlRole = {
  description?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  isSystem: Scalars['Boolean']['output'];
  name: Scalars['String']['output'];
};

export type GqlRoleDetail = {
  description?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  isSystem: Scalars['Boolean']['output'];
  name: Scalars['String']['output'];
  permissions: Array<GqlPermission>;
};

export type GqlSeverity =
  | 'CRITICAL'
  | 'HIGH'
  | 'LOW'
  | 'MEDIUM';

export type GqlSubscription = {
  documentUploaded: GqlDocument;
  incidentCreated: GqlIncident;
  incidentStatusChanged: GqlIncident;
  logEntryAdded: GqlLogEntry;
  logEntryUpdated: GqlLogEntry;
  timelineEventAdded: GqlTimelineEvent;
};


export type GqlSubscriptionDocumentUploadedArgs = {
  incidentId: Scalars['ID']['input'];
};


export type GqlSubscriptionIncidentStatusChangedArgs = {
  incidentId: Scalars['ID']['input'];
};


export type GqlSubscriptionLogEntryAddedArgs = {
  cell?: InputMaybe<GqlCell>;
  incidentId: Scalars['ID']['input'];
};


export type GqlSubscriptionLogEntryUpdatedArgs = {
  cell?: InputMaybe<GqlCell>;
  incidentId: Scalars['ID']['input'];
};


export type GqlSubscriptionTimelineEventAddedArgs = {
  incidentId: Scalars['ID']['input'];
};

export type GqlTag = {
  color: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
};

export type GqlTimelineEvent = {
  actor?: Maybe<GqlUser>;
  affectedUser?: Maybe<Scalars['String']['output']>;
  assetName?: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['String']['output'];
  description?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  incidentId: Scalars['ID']['output'];
  ioc?: Maybe<Scalars['String']['output']>;
  ipAddress?: Maybe<Scalars['String']['output']>;
  isFirstDetection: Scalars['Boolean']['output'];
  occurredAt: Scalars['String']['output'];
  openctiEntityId?: Maybe<Scalars['String']['output']>;
  openctiEntityType?: Maybe<Scalars['String']['output']>;
  title: Scalars['String']['output'];
  type: GqlTimelineEventType;
  updatedAt: Scalars['String']['output'];
};

export type GqlTimelineEventType =
  | 'ACTION'
  | 'COMMUNICATION'
  | 'DECISION'
  | 'DETECTION'
  | 'ESCALATION'
  | 'RESOLUTION';

export type GqlUpdateContactInput = {
  email?: InputMaybe<Scalars['String']['input']>;
  firstName?: InputMaybe<Scalars['String']['input']>;
  lastName?: InputMaybe<Scalars['String']['input']>;
  notes?: InputMaybe<Scalars['String']['input']>;
  organization?: InputMaybe<Scalars['String']['input']>;
  phone?: InputMaybe<Scalars['String']['input']>;
  role?: InputMaybe<Scalars['String']['input']>;
  site?: InputMaybe<Scalars['String']['input']>;
};

export type GqlUpdateIncidentInput = {
  description?: InputMaybe<Scalars['String']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  severity?: InputMaybe<GqlSeverity>;
  status?: InputMaybe<GqlIncidentStatus>;
};

export type GqlUpdateTimelineEventInput = {
  affectedUser?: InputMaybe<Scalars['String']['input']>;
  assetName?: InputMaybe<Scalars['String']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  ioc?: InputMaybe<Scalars['String']['input']>;
  ipAddress?: InputMaybe<Scalars['String']['input']>;
  isFirstDetection?: InputMaybe<Scalars['Boolean']['input']>;
  occurredAt?: InputMaybe<Scalars['String']['input']>;
  title?: InputMaybe<Scalars['String']['input']>;
  type?: InputMaybe<GqlTimelineEventType>;
};

export type GqlUser = {
  company?: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['String']['output'];
  email: Scalars['String']['output'];
  firstName: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  isActive: Scalars['Boolean']['output'];
  lastName: Scalars['String']['output'];
  mustChangePassword: Scalars['Boolean']['output'];
  permissions: Array<GqlUserPermission>;
  phone?: Maybe<Scalars['String']['output']>;
  roles: Array<GqlRole>;
  site?: Maybe<Scalars['String']['output']>;
};

export type GqlUserPermission = {
  action: Scalars['String']['output'];
  resource: Scalars['String']['output'];
};
