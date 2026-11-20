import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { once } from 'node:events';
const require=createRequire(import.meta.url);
const express=require('/app/node_modules/express');
const { prisma }=require('/app/dist/prisma.js');
const {generateWazuhConnectorSecret,hashWazuhConnectorSecret}=require('/app/dist/services/wazuhConnectorCredentials.js');
const route=require('/app/dist/routes/wazuhCorrelation.js').default;
const A='vm130mb-tenant-a', B='vm130mb-tenant-b';
const HASH='a'.repeat(64), DOMAIN='malicious.example.org';
const secret=generateWazuhConnectorSecret();
let server;
let base;
let count=0;
async function send(alert, id='vm130mb-connector-a', credential=secret) {
  const resp=await fetch(base+'/api/integrations/wazuh/correlate',{
    method:'POST', headers:{'content-type':'application/json',
      'x-opencrisis-connector-id':id,
      'x-opencrisis-connector-secret':credential}, body:JSON.stringify(alert),
  });
  return {status:resp.status, body:await resp.json(),headers:resp.headers};
}
const alert=(indicators=[{type:'HASH_SHA256',value:HASH}],extras={})=>({externalEventId:'v04-event',indicators,...extras});
function ok(message) { count++; console.log('PASS '+String(count).padStart(2,'0')+' : '+message); }

try {
  await prisma.tenant.createMany({data:[{id:A,slug:A,name:'Fictional A'},{id:B,slug:B,name:'Fictional B'}]});
  await prisma.wazuhConnector.create({data:{id:'vm130mb-connector-a',name:'Wazuh A',sourceId:'vm130mb-source-a',tenantId:A,secretHash:hashWazuhConnectorSecret(secret)}});
  await prisma.sharedThreat.createMany({data:[
    {id:'vm130mb-threat-hash',indicatorType:'HASH_SHA256',indicatorValue:HASH,title:'SHA known',mitigation:'Isoler hote',publishedById:'vm130mb-reviewer'},
    {id:'vm130mb-threat-domain',indicatorType:'DOMAIN',indicatorValue:DOMAIN,title:'Domain known',mitigation:'Bloquer DNS',publishedById:'vm130mb-reviewer'},
  ]});
  const app=express();
  app.use(express.json({limit:'32kb'}));
  app.use('/api/integrations/wazuh',route);
  server=app.listen(0,'127.0.0.1');
  await once(server,'listening');
  base=`http://127.0.0.1:${server.address().port}`;

  let r=await send(alert());
  assert.equal(r.status,200);assert.equal(r.body.matched,true);
  assert.equal(r.body.confidence,90);assert.equal(r.body.incidentAutomaticallyCreated,false);
  assert.equal(r.body.analystReviewRequired,true);
  assert.equal(r.headers.get('cache-control'),'no-store');
  ok('Secret reelement valide en DB : hash reconnu et revue humaine');

  r=await send(alert([{type:'DOMAIN',value:DOMAIN.toUpperCase()}]));
  assert.equal(r.status,200);assert.equal(r.body.confidence,70);
  ok('Domaine publie trouve via HTTP');

  r=await send(alert([{type:'DOMAIN',value:'nomatch.example.org'}]));
  assert.equal(r.status,200);assert.equal(r.body.matched,false);
  ok('IOC non connu : aucune correspondance');

  r=await send(alert(),'vm130mb-connector-a',generateWazuhConnectorSecret());
  assert.equal(r.status,401);ok('Mauvais secret refuse');
  r=await send(alert(),'vm130mb-unknown',secret);
  assert.equal(r.status,401);ok('Connecteur inconnu refuse');
  const missing=await fetch(base+'/api/integrations/wazuh/correlate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(alert())});
  assert.equal(missing.status,401);ok('En-tetes manquants refuses');

  r=await send(alert(undefined,{eventTenantId:B}));
  assert.equal(r.status,403);ok('Usurpation du tenant B refusee');
  r=await send({externalEventId:'ok',indicators:[],tenantId:B});
  assert.equal(r.status,400);ok('Champ tenantId arbitraire interdit');
  r=await send(alert(Array(21).fill({type:'DOMAIN',value:DOMAIN})));
  assert.equal(r.status,400);ok('Nombre IOC limite');

  assert.equal(await prisma.incident.count(),0);
  assert.equal(await prisma.incidentProposal.count(),0);
  assert.equal(await prisma.auditLog.count(),0);
  ok('Correlation sans creation d incident, proposition ni audit');

  const body=(await send(alert())).body;
  for(const forbidden of ['tenantId','sourceId','secretHash','incidentId','proposalId']) {
    assert.equal(JSON.stringify(body).includes('"'+forbidden+'"'),false);
  }
  ok('Reponse sans identifiants internes ni secrets');

  await prisma.wazuhConnector.update({where:{id:'vm130mb-connector-a'},data:{isActive:false,revokedAt:new Date()}});
  r=await send(alert());assert.equal(r.status,401);ok('Connecteur revoque refuse');

  console.log(`=== VM130MB : ${count} assertions HTTP/DB reussies ===`);
} catch(err) {
  console.error('ECHEC HTTP/DB :',err);
  process.exitCode=1;
} finally {
  if(server)await new Promise(resolve=>server.close(resolve));
  await prisma.$disconnect();
}
