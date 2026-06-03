-- P1/F6 — Index DB pour les FK principales et colonnes de filtre fréquentes

-- User
CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");
CREATE INDEX "User_isActive_idx" ON "User"("isActive");

-- RefreshToken
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");
CREATE INDEX "RefreshToken_expiresAt_idx" ON "RefreshToken"("expiresAt");

-- Incident
CREATE INDEX "Incident_status_idx" ON "Incident"("status");
CREATE INDEX "Incident_deletedAt_idx" ON "Incident"("deletedAt");
CREATE INDEX "Incident_createdById_idx" ON "Incident"("createdById");

-- LogEntry
CREATE INDEX "LogEntry_incidentId_cell_deletedAt_idx" ON "LogEntry"("incidentId", "cell", "deletedAt");
CREATE INDEX "LogEntry_authorId_idx" ON "LogEntry"("authorId");
CREATE INDEX "LogEntry_createdAt_idx" ON "LogEntry"("createdAt");

-- TimelineEvent
CREATE INDEX "TimelineEvent_incidentId_occurredAt_idx" ON "TimelineEvent"("incidentId", "occurredAt");

-- Document
CREATE INDEX "Document_incidentId_deletedAt_idx" ON "Document"("incidentId", "deletedAt");
CREATE INDEX "Document_uploadedById_idx" ON "Document"("uploadedById");

-- Contact
CREATE INDEX "Contact_deletedAt_idx" ON "Contact"("deletedAt");
CREATE INDEX "Contact_isGlobal_idx" ON "Contact"("isGlobal");

-- AuditLog — la plus critique (pagination admin + requêtes chronologiques)
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");
CREATE INDEX "AuditLog_incidentId_idx" ON "AuditLog"("incidentId");
CREATE INDEX "AuditLog_resource_action_idx" ON "AuditLog"("resource", "action");
