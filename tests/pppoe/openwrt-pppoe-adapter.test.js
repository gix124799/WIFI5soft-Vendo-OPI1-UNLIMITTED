'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fsp=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const { createOpenWrtPppoeAdapter }=require('../../src/pppoe/openwrt-pppoe-adapter');
async function fixture(t){const d=await fsp.mkdtemp(path.join(os.tmpdir(),'ethyl-chap-'));t.after(()=>fsp.rm(d,{recursive:true,force:true}));const f=path.join(d,'chap-secrets');await fsp.writeFile(f,'#USERNAME  PROVIDER  PASSWORD  IPADDRESS\n');return {d,f,adapter:createOpenWrtPppoeAdapter({chapSecretsPath:f})};}

test('writes enabled local account atomically in CHAP format',async(t)=>{const {f,adapter}=await fixture(t);await adapter.upsertAccount({username:'client1',secret:'p w"x',enabled:true,expiresAt:null});const text=await fsp.readFile(f,'utf8');assert.match(text,/# ETHYLNET managed: client1/);assert.equal(text.includes(String.raw`"client1" * "p w\"x" *`),true);assert.equal((await fsp.stat(f)).mode & 0o777,0o600);});

test('username update removes previous managed line',async(t)=>{const {f,adapter}=await fixture(t);await adapter.upsertAccount({username:'old',secret:'a',enabled:true,expiresAt:null});await adapter.upsertAccount({username:'new',secret:'b',enabled:true,expiresAt:null},{username:'old'});const text=await fsp.readFile(f,'utf8');assert.doesNotMatch(text,/managed: old/);assert.match(text,/managed: new/);});

test('disabled or expired account is removed from CHAP auth',async(t)=>{const {f,adapter}=await fixture(t);await adapter.upsertAccount({username:'client',secret:'pw',enabled:true,expiresAt:null});await adapter.upsertAccount({username:'client',secret:'pw',enabled:false,expiresAt:null},{username:'client'});assert.doesNotMatch(await fsp.readFile(f,'utf8'),/managed: client/);await adapter.upsertAccount({username:'expired',secret:'pw',enabled:true,expiresAt:1000});const expired=createOpenWrtPppoeAdapter({chapSecretsPath:f,now:()=>2000});await expired.upsertAccount({username:'expired',secret:'pw',enabled:true,expiresAt:1000});assert.doesNotMatch(await fsp.readFile(f,'utf8'),/managed: expired/);});

test('removeAccount removes only ETHYLNET managed matching account',async(t)=>{const {f,adapter}=await fixture(t);await fsp.appendFile(f,'"manual" * "keep" *\n');await adapter.upsertAccount({username:'client',secret:'pw',enabled:true,expiresAt:null});await adapter.removeAccount({username:'client'});const text=await fsp.readFile(f,'utf8');assert.match(text,/"manual"/);assert.doesNotMatch(text,/managed: client/);});

test('rejects control characters in credentials before file mutation',async(t)=>{const {f,adapter}=await fixture(t);const before=await fsp.readFile(f);await assert.rejects(adapter.upsertAccount({username:'bad\nname',secret:'pw',enabled:true,expiresAt:null}),/credential/i);assert.deepEqual(await fsp.readFile(f),before);});
