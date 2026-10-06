'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..', '..');
const { stageRootfs } = require(path.join(root, 'integration', 'openwrt', 'stage-rootfs'));

async function fixture(t) {
  const target = await fsp.mkdtemp(path.join(os.tmpdir(), 'ethyl-captive-dns-'));
  t.after(() => fsp.rm(target, { recursive: true, force: true }));

  await fsp.mkdir(path.join(target, 'etc', 'config'), { recursive: true });
  await fsp.writeFile(path.join(target, 'etc', 'config', 'dhcp'), "config dnsmasq\n\toption leasefile '/mnt/wifi5/dhcp.leases'\n");
  await fsp.mkdir(path.join(target, 'soft', 'config'), { recursive: true });
  await fsp.writeFile(path.join(target, 'soft', 'config', 'nginx.locations'), "root /tmp/i/public;\nlocation / { try_files $uri @backend; }\nlocation @backend { proxy_pass http://backend; }\n");
  await fsp.writeFile(path.join(target, 'soft', 'config', 'admin.locations'), "root /tmp/i/public;\nlocation /admin { try_files $uri @backend; }\nlocation / { return 302 http://$host/admin; }\n");
  return target;
}

test('captive DNS nft rules bypass authorized clients and intercept both UDP and TCP DNS before HTTP', async () => {
  const text = await fsp.readFile(path.join(root, 'integration', 'openwrt', 'nftables', 'chain-pre', 'dstnat', '20-ethyl-portal.nft'), 'utf8');
  const authorized = text.indexOf('@ethyl_authorized_macs return');
  const udp = text.indexOf('udp dport 53 redirect to :1053');
  const tcp = text.indexOf('tcp dport 53 redirect to :1053');
  const http = text.indexOf('tcp dport 80 redirect to :80');
  assert.ok(authorized >= 0, 'authorized bypass missing');
  assert.ok(udp > authorized, 'UDP DNS interception must follow authorized bypass');
  assert.ok(tcp > authorized, 'TCP DNS interception must follow authorized bypass');
  assert.ok(http > udp && http > tcp, 'HTTP redirect must remain after DNS interception');
});

test('dedicated captive DNS service is WAN-independent and maps all names to 10.0.0.1 on port 1053', async () => {
  const file = path.join(root, 'integration', 'openwrt', 'ethyl-captive-dns.init');
  const text = await fsp.readFile(file, 'utf8');
  assert.match(text, /START=79/);
  assert.match(text, /\/usr\/sbin\/dnsmasq/);
  assert.match(text, /--conf-file=\/dev\/null/);
  assert.match(text, /LISTEN_PORT=\$\{ETHYL_CAPTIVE_DNS_PORT:-1053\}/);
  assert.match(text, /LISTEN_IP=\$\{ETHYL_CAPTIVE_DNS_IP:-10\.0\.0\.1\}/);
  assert.match(text, /--port="\$LISTEN_PORT"/);
  assert.match(text, /--listen-address="\$LISTEN_IP"/);
  assert.match(text, /--no-resolv/);
  assert.match(text, /--address=\/#\/10\.0\.0\.1/);
  assert.doesNotMatch(text, /8\.8\.8\.8|server=/);
});

test('staging installs executable captive DNS service without changing early DHCP lease semantics', async (t) => {
  const target = await fixture(t);
  await stageRootfs({ projectRoot: root, targetRoot: target });

  const service = path.join(target, 'etc', 'init.d', 'ethyl-captive-dns');
  assert.equal(fs.existsSync(service), true);
  assert.notEqual((await fsp.stat(service)).mode & 0o111, 0);
  const serviceText = await fsp.readFile(service, 'utf8');
  assert.match(serviceText, /LISTEN_PORT=\$\{ETHYL_CAPTIVE_DNS_PORT:-1053\}/);
  assert.match(serviceText, /--port="\$LISTEN_PORT"/);

  const dhcp = await fsp.readFile(path.join(target, 'etc', 'config', 'dhcp'), 'utf8');
  assert.match(dhcp, /option leasefile '\/tmp\/dhcp\.leases'/);
  assert.doesNotMatch(dhcp, /address=\/#\/10\.0\.0\.1/);
});
