'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createAccessReconciler } = require('../../src/network/access-reconciler');

test('reconciler maps only active timed sessions to device MAC access entries', async () => {
  const calls=[];
  const sessions={list(){return [
    {deviceId:'d1',remainingSeconds:120,state:'active'},
    {deviceId:'d2',remainingSeconds:0,state:'exhausted'},
    {deviceId:'d3',remainingSeconds:30,state:'active'},
  ];}};
  const devices={get(id){return {d1:{mac:'aa:bb:cc:dd:ee:01'},d2:{mac:'aa:bb:cc:dd:ee:02'},d3:{mac:'aa:bb:cc:dd:ee:03'}}[id];}};
  const adapter={async sync(entries){calls.push(entries);}};
  const reconciler=createAccessReconciler({sessions,devices,adapter,setIntervalFn:()=>99,clearIntervalFn:()=>{}});
  await reconciler.reconcile();
  assert.deepEqual(calls[0],[
    {mac:'aa:bb:cc:dd:ee:01',remainingSeconds:120},
    {mac:'aa:bb:cc:dd:ee:03',remainingSeconds:30},
  ]);
});

test('start reconciles immediately and schedules refresh without DB mutation', async () => {
  const calls=[]; let scheduled;
  const reconciler=createAccessReconciler({
    sessions:{list(){calls.push('list');return[];}}, devices:{get(){}},
    adapter:{async sync(entries){calls.push(['sync',entries]);}},
    setIntervalFn(fn,ms){scheduled={fn,ms};return 7;}, clearIntervalFn(id){calls.push(['clear',id]);}, intervalMs:5000,
  });
  await reconciler.start();
  assert.equal(scheduled.ms,5000);
  assert.deepEqual(calls.slice(0,2),['list',['sync',[]]]);
  await reconciler.stop();
  assert.deepEqual(calls.at(-1),['clear',7]);
});
