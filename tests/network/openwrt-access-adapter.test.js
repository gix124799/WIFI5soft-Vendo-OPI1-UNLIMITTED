'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createOpenWrtAccessAdapter } = require('../../src/network/openwrt-access-adapter');

test('sync flushes ETHYLNET set then adds only validated MACs with bounded timeouts', async () => {
  const calls=[];
  const execFile=async (file,args)=>{calls.push([file,args]);};
  const adapter=createOpenWrtAccessAdapter({execFile});
  await adapter.sync([
    {mac:'aa:bb:cc:dd:ee:01', remainingSeconds:61},
    {mac:'02:00:00:00:00:02', remainingSeconds:5},
  ]);
  assert.deepEqual(calls, [
    ['/usr/sbin/nft',['flush','set','inet','fw4','ethyl_authorized_macs']],
    ['/usr/sbin/nft',['add','element','inet','fw4','ethyl_authorized_macs','{','aa:bb:cc:dd:ee:01','timeout','61s','}']],
    ['/usr/sbin/nft',['add','element','inet','fw4','ethyl_authorized_macs','{','02:00:00:00:00:02','timeout','5s','}']],
  ]);
});

test('sync rejects invalid MAC and invalid duration before invoking nft', async () => {
  let calls=0;
  const adapter=createOpenWrtAccessAdapter({execFile:async()=>{calls++;}});
  await assert.rejects(adapter.sync([{mac:'bad;mac',remainingSeconds:10}]), /MAC/i);
  await assert.rejects(adapter.sync([{mac:'aa:bb:cc:dd:ee:01',remainingSeconds:0}]), /seconds/i);
  assert.equal(calls,0);
});
