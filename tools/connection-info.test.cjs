const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
async function fixture({failToken=false,status=200,sp={}}={}){
 const calls=[];let popups=0;
 const box={URL,AbortSignal,console,AUTH_CONFIG:{clientId:'11111111-1111-1111-1111-111111111111',scopes:['Directory.Read.All'],graphBase:'https://graph.microsoft.com/beta'},window:{location:{origin:'http://localhost',pathname:'/'}},
 msal:{PublicClientApplication:class{initialize(){return Promise.resolve()}handleRedirectPromise(){return Promise.resolve(null)}acquireTokenSilent(){if(failToken)throw Error('expired');return Promise.resolve({accessToken:'fixture'})}acquireTokenPopup(){popups++;throw Error('Unexpected popup')}}},
 fetch:async(url,options)=>{calls.push({url,options});return {ok:status===200,json:async()=>sp}}};
 vm.createContext(box);vm.runInContext(fs.readFileSync(require.resolve('../js/graph.js'),'utf8')+'\nglobalThis.api=Graph;',box);await box.api.init();return {result:await box.api.connectionInfo(),calls,popups};
}
test('connection metadata uses the configured client ID and Graph owner, not authority',async()=>{
 const x=await fixture({sp:{displayName:'External App',appOwnerOrganizationId:'external-owner',signInAudience:'AzureADMultipleOrgs'}});
 assert.equal(x.result.ownerTenantId,'external-owner');assert.equal(x.result.name,'External App');assert.equal(x.result.audience,'AzureADMultipleOrgs');assert.match(x.calls[0].url,/servicePrincipals\(appId='11111111-1111-1111-1111-111111111111'\)/);assert.equal(x.popups,0);
});
test('unreadable app registration retains client ID and does not claim an owner',async()=>{const x=await fixture({status:403});assert.equal(x.result.ownerTenantId,null);assert.ok(x.result.clientId);assert.equal(x.popups,0)});
test('expired token never triggers interactive consent for account metadata',async()=>{const x=await fixture({failToken:true});assert.equal(x.result.ownerTenantId,null);assert.equal(x.calls.length,0);assert.equal(x.popups,0)});
