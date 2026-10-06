'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..', '..', '..');
const verifierPath = path.join(root, 'integration', 'openwrt', 'verify-rootfs-contract.js');

async function put(base, relative, content, mode = 0o644) {
  const file = path.join(base, relative);
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, content, { mode });
  await fsp.chmod(file, mode);
  return file;
}

async function validRoot(t) {
  const target = await fsp.mkdtemp(path.join(os.tmpdir(), 'ethyl-rootfs-contract-'));
  t.after(() => fsp.rm(target, { recursive: true, force: true }));

  await put(target, 'etc/config/network', [
    "config device",
    "\toption name 'br-lan'",
    "\toption type 'bridge'",
    "\tlist ports 'eth1'",
    "\tlist ports 'vlan.22'",
    "\tlist ports 'vlan.13'",
    "config interface 'lan'",
    "\toption device 'br-lan'",
    "\toption proto 'static'",
    "\toption ipaddr '10.0.0.1'",
    "\toption netmask '255.255.224.0'",
    '',
  ].join('\n'));
  await put(target, 'etc/config/dhcp', "config dnsmasq\n\toption leasefile '/tmp/dhcp.leases'\n");
  await put(target, 'etc/config/dropbear', "config dropbear main\n\toption enable '1'\n\toption Interface 'lan'\n");
  await put(target, 'soft/config/admin.locations', [
    'root /soft/ethyl-core/public;',
    'location /admin { try_files $uri @backend; }',
    'location / { try_files $uri @backend; }',
    'location @backend { proxy_pass http://backend; }',
    '',
  ].join('\n'));
  await put(target, 'soft/config/nginx.locations', [
    'root /soft/ethyl-core/public;',
    'location = / { try_files /index.html @backend; }',
    'location = /admin { try_files /admin/index.html @backend; }',
    'location = /generate_204 { return 302 http://10.0.0.1/; }',
    'location = /hotspot-detect.html { return 302 http://10.0.0.1/; }',
    'location = /connecttest.txt { return 302 http://10.0.0.1/; }',
    'location = /ncsi.txt { return 302 http://10.0.0.1/; }',
    'location = /canonical.html { return 302 http://10.0.0.1/; }',
    'location / { try_files $uri @backend; }',
    '',
  ].join('\n'));
  await put(target, 'soft/config/nginx.conf', [
    'upstream backend {',
    '  server localhost:3000;',
    '}',
    'upstream subvendo_backend {',
    '  server localhost:3001;',
    '}',
    '',
  ].join('\n'));
  await put(target, 'soft/config/pppoe.locations', 'location @backend { proxy_pass http://127.0.0.1:3002; }\n');
  await put(target, 'usr/share/nftables.d/chain-pre/dstnat/20-ethyl-portal.nft', [
    'meta iifname "br-lan" ether saddr @ethyl_authorized_macs return',
    'meta iifname "br-lan" udp dport 53 redirect to :1053',
    'meta iifname "br-lan" tcp dport 53 redirect to :1053',
    'meta iifname "br-lan" tcp dport 80 redirect to :80',
    '',
  ].join('\n'));
  await put(target, 'usr/libexec/ethyl/wifi5-storage-bootstrap.sh', '#!/bin/sh\nexit 0\n', 0o755);
  await put(target, 'etc/init.d/ethyl-captive-dns', [
    '#!/bin/sh /etc/rc.common',
    'START=79',
    'DNSMASQ_BIN=/usr/sbin/dnsmasq',
    'LISTEN_PORT=1053',
    'procd_set_param command /usr/sbin/dnsmasq --conf-file=/dev/null --port="$LISTEN_PORT" --no-resolv --address=/#/10.0.0.1',
    '',
  ].join('\n'), 0o755);
  await put(target, 'etc/init.d/soft', [
    '#!/bin/sh /etc/rc.common',
    'START=95',
    'BOOTSTRAP=/usr/libexec/ethyl/wifi5-storage-bootstrap.sh',
    'procd_set_param command /usr/bin/node /soft/ethyl-core/bin/ethyl-core.js',
    '',
  ].join('\n'), 0o755);
  await put(target, 'soft/ethyl-core/bin/ethyl-core.js', "'use strict';\n", 0o755);
  await put(target, 'soft/ethyl-core/public/index.html', '<title>ETHYLNET WiFi</title>\n');
  await put(target, 'soft/ethyl-core/public/admin/index.html', '<title>ETHYLNET Admin</title>\n');
  await put(target, 'soft/ethyl-core/public/portal.css', 'body{}\n');
  await put(target, 'soft/ethyl-core/public/portal.js', "'use strict';\n");
  await put(target, 'soft/ethyl-core/public/admin.css', 'body{}\n');
  await put(target, 'soft/ethyl-core/public/admin.js', "'use strict';\n");
  return target;
}

function loadVerifier() {
  delete require.cache[require.resolve(verifierPath)];
  return require(verifierPath).verifyRootfsContract;
}

test('valid staged rootfs passes every deterministic boot and portal check', async (t) => {
  const targetRoot = await validRoot(t);
  const verifyRootfsContract = loadVerifier();
  const result = verifyRootfsContract({ targetRoot });
  assert.equal(result.ok, true);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.checks), true);
  assert.deepEqual(result.checks, {
    LAN_10_0_0_1: true,
    LAN_ETH1: true,
    DHCP_EARLY_TMP: true,
    PORTAL_REDIRECT_80: true,
    ADMIN_ROUTE: true,
    BACKEND_3000_3001_3002: true,
    DROPBEAR_LAN: true,
    STORAGE_BOOTSTRAP: true,
    CLEAN_ROOM_ONLY: true,
    UI_STATIC_ROOT: true,
    CAPTIVE_PROBES: true,
    CAPTIVE_DNS: true,
  });
});

test('wrong LAN address fails LAN_10_0_0_1 only', async (t) => {
  const targetRoot = await validRoot(t);
  const file = path.join(targetRoot, 'etc/config/network');
  const text = (await fsp.readFile(file, 'utf8')).replace('10.0.0.1', '10.0.1.1');
  await fsp.writeFile(file, text);
  const result = loadVerifier()({ targetRoot });
  assert.equal(result.ok, false);
  assert.equal(result.checks.LAN_10_0_0_1, false);
  assert.equal(result.checks.LAN_ETH1, true);
});

test('missing eth1 bridge membership fails LAN_ETH1', async (t) => {
  const targetRoot = await validRoot(t);
  const file = path.join(targetRoot, 'etc/config/network');
  const text = (await fsp.readFile(file, 'utf8')).replace("\tlist ports 'eth1'\n", '');
  await fsp.writeFile(file, text);
  const result = loadVerifier()({ targetRoot });
  assert.equal(result.ok, false);
  assert.equal(result.checks.LAN_ETH1, false);
});

test('missing admin route fails ADMIN_ROUTE', async (t) => {
  const targetRoot = await validRoot(t);
  const file = path.join(targetRoot, 'soft/config/admin.locations');
  const text = (await fsp.readFile(file, 'utf8')).replace('location /admin { try_files $uri @backend; }\n', '');
  await fsp.writeFile(file, text);
  const result = loadVerifier()({ targetRoot });
  assert.equal(result.ok, false);
  assert.equal(result.checks.ADMIN_ROUTE, false);
});

test('legacy opaque core makes CLEAN_ROOM_ONLY fail', async (t) => {
  const targetRoot = await validRoot(t);
  await put(targetRoot, 'soft/index.o', 'legacy', 0o755);
  const result = loadVerifier()({ targetRoot });
  assert.equal(result.ok, false);
  assert.equal(result.checks.CLEAN_ROOM_ONLY, false);
});

test('CLI exits 0 only for a passing rootfs and prints named checks', async (t) => {
  const targetRoot = await validRoot(t);
  const pass = spawnSync(process.execPath, [verifierPath, targetRoot], { encoding: 'utf8' });
  assert.equal(pass.status, 0, pass.stderr || pass.stdout);
  assert.match(pass.stdout, /LAN_10_0_0_1=PASS/);
  assert.match(pass.stdout, /ADMIN_ROUTE=PASS/);

  await put(targetRoot, 'soft/index.o', 'legacy', 0o755);
  const fail = spawnSync(process.execPath, [verifierPath, targetRoot], { encoding: 'utf8' });
  assert.notEqual(fail.status, 0);
  assert.match(fail.stdout, /CLEAN_ROOM_ONLY=FAIL/);
});


test('missing persistent UI root fails UI_STATIC_ROOT', async (t) => {
  const targetRoot = await validRoot(t);
  await fsp.rm(path.join(targetRoot, 'soft', 'ethyl-core', 'public', 'index.html'));
  const result = loadVerifier()({ targetRoot });
  assert.equal(result.ok, false);
  assert.equal(result.checks.UI_STATIC_ROOT, false);
});

test('missing captive probe redirect fails CAPTIVE_PROBES', async (t) => {
  const targetRoot = await validRoot(t);
  const file = path.join(targetRoot, 'soft', 'config', 'nginx.locations');
  const text = (await fsp.readFile(file, 'utf8')).replace('location = /generate_204 { return 302 http://10.0.0.1/; }\n', '');
  await fsp.writeFile(file, text);
  const result = loadVerifier()({ targetRoot });
  assert.equal(result.ok, false);
  assert.equal(result.checks.CAPTIVE_PROBES, false);
});


test('missing captive DNS service fails CAPTIVE_DNS', async (t) => {
  const targetRoot = await validRoot(t);
  await fsp.rm(path.join(targetRoot, 'etc', 'init.d', 'ethyl-captive-dns'));
  const result = loadVerifier()({ targetRoot });
  assert.equal(result.ok, false);
  assert.equal(result.checks.CAPTIVE_DNS, false);
});
