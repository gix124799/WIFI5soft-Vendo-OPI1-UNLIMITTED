'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {createPppoeHttpService}=require('../../src/pppoe/pppoe-http-service');

function response(){return {statusCode:0,headers:{},body:'',setHeader(k,v){this.headers[k.toLowerCase()]=v;},end(v=''){this.body+=v;}};}
function request(method,url,body){const r=new EventEmitter();r.method=method;r.url=url;process.nextTick(()=>{if(body!==undefined)r.emit('data',Buffer.from(JSON.stringify(body)));r.emit('end');});return r;}

test('binds dedicated PPPoE backend only on localhost:3002',async()=>{
  let config; const calls=[];
  const service=createPppoeHttpService({
    pppoe:{list(){return[];},create(){},update(){},remove(){}},
    listenerFactory(opts){config=opts;return{async start(){calls.push('start');},async stop(){calls.push('stop');},isStarted(){return calls.at(-1)==='start';}};}
  });
  await service.start();
  assert.equal(config.host,'localhost'); assert.equal(config.port,3002); assert.equal(typeof config.handler,'function');
  await service.stop(); assert.deepEqual(calls,['start','stop']);
});

test('serves local PPPoE health and accounts without WAN',async()=>{
  let handler;
  const service=createPppoeHttpService({
    pppoe:{list(){return[{id:'p1',username:'local'}];},async create(x){return x;},async update(){},async remove(){return true;}},
    listenerFactory(opts){handler=opts.handler;return{async start(){},async stop(){},isStarted(){return true;}};}
  });
  await service.start();
  let res=response(); await handler(request('GET','/'),res); assert.equal(res.statusCode,200); let data=JSON.parse(res.body); assert.equal(data.local,true); assert.equal(data.wanRequired,false);
  res=response(); await handler(request('GET','/api/v1/pppoe/accounts'),res); data=JSON.parse(res.body); assert.equal(data.data[0].username,'local');
});
