import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
// L'image builder comprend le JS compile mais aucune connexion DB autorisee.
const { prisma } = require('/app/dist/prisma.js');
const { correlateTrustedWazuhAlert } = require('/app/dist/services/wazuhThreatCorrelation.js');
const source = { tenantId: 'a', sourceId: 'trusted-source-a' };
const HASH = 'A'.repeat(64);
const threat = { id:'threat-1', indicatorType:'HASH_SHA256', indicatorValue:HASH.toLowerCase(), mitigation:'Isoler et examiner le poste' };
const oldTenant = prisma.tenant.findFirst;
const oldThreats = prisma.sharedThreat.findMany;
function stub(tenant, threats, onQuery = () => {}) {
  prisma.tenant.findFirst = async args => { onQuery('tenant',args); return tenant; };
  prisma.sharedThreat.findMany = async args => { onQuery('threats',args); return threats; };
}
function reset(){ prisma.tenant.findFirst=oldTenant; prisma.sharedThreat.findMany=oldThreats; }
const event=(indicators)=>({externalEventId:'lab-event',indicators});

test('Hash publie exact : score 90, revue humaine, zero incident cree', async () => {
  stub({id:'a'},[threat],(which,args) => {
    if (which==='threats') {
      assert.equal(args.where.revokedAt,null);
      assert.deepEqual(args.select, {id:true,indicatorType:true,indicatorValue:true,mitigation:true});
      assert.equal(args.where.OR[0].indicatorValue, HASH.toLowerCase());
    }
  });
  try {
    const r=await correlateTrustedWazuhAlert(source,event([{type:'HASH_SHA256',value:HASH}]));
    assert.equal(r.confidence,90); assert.equal(r.matches.length,1);
    assert.equal(r.analystReviewRequired,true);
    assert.equal(r.incidentAutomaticallyCreated,false);
    assert.equal(r.matches[0].mitigation,'Isoler et examiner le poste');
  } finally { reset(); }
});

test('Domaine exact : score 70 et normalisation', async()=>{
  stub({id:'a'},[{id:'domain-1', indicatorType:'DOMAIN',indicatorValue:'malicious.org',mitigation:'Bloquer le domaine'}]);
  try {
    const r=await correlateTrustedWazuhAlert(source,event([{type:'DOMAIN',value:'MALICIOUS.ORG.'}]));
    assert.equal(r.confidence,70);assert.equal(r.matches[0].indicatorValue,'malicious.org');
  } finally {reset();}
});

test('Sans correspondance, aucune creation et score zero',async()=>{
  stub({id:'a'},[]);
  try {const r=await correlateTrustedWazuhAlert(source,event([{type:'DOMAIN',value:'unknown.org'}]));
    assert.equal(r.matched,false);assert.equal(r.confidence,0);assert.equal(r.matches.length,0);
  } finally {reset();}
});

test('Pas de recherche pour un tenant inactif',async()=>{
  let touched=false;
  stub(null,[],w=>{if(w==='threats')touched=true;});
  try {await assert.rejects(()=>correlateTrustedWazuhAlert(source,event([])));
    assert.equal(touched,false);
  } finally {reset();}
});

test('Identite de connecteur obligatoire',async()=>{
  await assert.rejects(()=>correlateTrustedWazuhAlert({tenantId:'',sourceId:'x'},event([])));
});

test('Aucune fuite de metadonnees de tenant dans les champs publics',async()=>{
  stub({id:'a'},[{...threat, tenantId:'b', incidentId:'private-incident', secret:'do-not-leak'}]);
  try {const r=await correlateTrustedWazuhAlert(source,event([{type:'HASH_SHA256',value:HASH}]));
    assert.equal(JSON.stringify(r).includes('private-incident'),false);
    assert.equal(JSON.stringify(r).includes('do-not-leak'),false);
  } finally {reset();}
});

test('Indicateurs malformes / exces rejete ; noms internes ignores',async()=>{
  stub({id:'a'},[]);
  try {
    await assert.rejects(()=>correlateTrustedWazuhAlert(source,event(Array(21).fill({type:'DOMAIN',value:'foo.org'}))));
    const r=await correlateTrustedWazuhAlert(source,event([{type:'DOMAIN',value:'intranet.local'}]));
    assert.equal(r.confidence,0);
  } finally {reset();}
});
