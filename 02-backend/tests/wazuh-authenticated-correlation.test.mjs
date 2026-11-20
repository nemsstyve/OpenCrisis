import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { prisma } = require('/app/dist/prisma.js');
const { generateWazuhConnectorSecret, hashWazuhConnectorSecret } = require('/app/dist/services/wazuhConnectorCredentials.js');
const { correlateAuthenticatedWazuhAlert } = require('/app/dist/services/wazuhAuthenticatedCorrelation.js');

const secret = generateWazuhConnectorSecret();
const secretHash = hashWazuhConnectorSecret(secret);
const HASH = 'a'.repeat(64);
const input = (extra = {}) => ({ externalEventId: 'test-alert-1', indicators: [{type:'HASH_SHA256', value: HASH}], ...extra });
const tenantId = 'company-a';
const original = {
  findConnector: prisma.wazuhConnector.findUnique,
  transaction: prisma.$transaction,
  findTenant: prisma.tenant.findFirst,
  findThreats: prisma.sharedThreat.findMany,
};
function mock({ connectorExists=true, active=true, sourceTenant=tenantId, currentHash=secretHash } = {}) {
  const calls = [];
  prisma.wazuhConnector.findUnique = async () => connectorExists ? {tenantId:sourceTenant} : null;
  prisma.$transaction = async callback => callback({$queryRaw:async (parts,...params) => {
    const sql = parts.join('?');
    if (sql.includes('FROM "Tenant"')) return active ? [{id:sourceTenant}] : [];
    if (sql.includes('FROM "WazuhConnector"')) return active ? [{id:'connector-a',tenantId:sourceTenant,sourceId:'source-a',secretHash:currentHash}] : [];
    throw new Error('Unexpected query');
  }});
  prisma.tenant.findFirst = async args => {
    calls.push('tenant');
    assert.equal(args.where.id, sourceTenant);
    return active ? {id:sourceTenant} : null;
  };
  prisma.sharedThreat.findMany = async args => {
    calls.push('threat');
    assert.equal(args.where.revokedAt,null);
    return [{id:'public-threat',indicatorType:'HASH_SHA256',indicatorValue:HASH,mitigation:'Isoler le poste'}];
  };
  return calls;
}
function reset(){
  prisma.wazuhConnector.findUnique=original.findConnector;
  prisma.$transaction=original.transaction;
  prisma.tenant.findFirst=original.findTenant;
  prisma.sharedThreat.findMany=original.findThreats;
}

test('Secret machine correct : correspondance publique et identite derivee de DB', async () => {
  const calls=mock();
  try {
    const result=await correlateAuthenticatedWazuhAlert(prisma,'connector-a',secret,input({eventTenantId:tenantId}));
    assert.equal(result.matched,true);
    assert.equal(result.confidence,90);
    assert.equal(result.incidentAutomaticallyCreated,false);
    assert.deepEqual(calls,['tenant','threat']);
    assert.equal(JSON.stringify(result).includes(secret), false);
    assert.equal(JSON.stringify(result).includes(tenantId), false);
  } finally {reset();}
});
test('Secret incorrect : aucune correlation', async () => {
  const calls=mock();
  try {
    const result=await correlateAuthenticatedWazuhAlert(prisma,'connector-a',generateWazuhConnectorSecret(),input());
    assert.equal(result,null); assert.deepEqual(calls,[]);
  } finally {reset();}
});
test('Connecteur inconnu : aucune correlation', async () => {
  const calls=mock({connectorExists:false});
  try {assert.equal(await correlateAuthenticatedWazuhAlert(prisma,'connector-a',secret,input()),null); assert.deepEqual(calls,[]);} finally {reset();}
});
test('Connecteur ou tenant inactif : aucune correlation', async () => {
  const calls=mock({active:false});
  try {assert.equal(await correlateAuthenticatedWazuhAlert(prisma,'connector-a',secret,input()),null); assert.deepEqual(calls,[]);} finally {reset();}
});
test('Tenant injecte dans l alerte : refus', async () => {
  const calls=mock();
  try {
    await assert.rejects(() => correlateAuthenticatedWazuhAlert(prisma,'connector-a',secret,input({eventTenantId:'company-b'})));
    assert.deepEqual(calls,[]);
  } finally {reset();}
});
test('Sans tenant fourni : identite serveur et sortie sans informations privees', async () => {
  const calls=mock();
  try {
    const result=await correlateAuthenticatedWazuhAlert(prisma,'connector-a',secret,input());
    assert.equal(result.matches[0].mitigation,'Isoler le poste');
    assert.equal(Object.hasOwn(result,'tenantId'),false);
    assert.deepEqual(calls,['tenant','threat']);
  } finally {reset();}
});
