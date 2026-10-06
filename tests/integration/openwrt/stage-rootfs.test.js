'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..', '..');
const { stageRootfs } = require('../../../integration/openwrt/stage-rootfs');

async function tempRoot(t) {
  const target = await fsp.mkdtemp(path.join(os.tmpdir(), 'ethyl-openwrt-stage-'));
  t.after(() => fsp.rm(target, { recursive: true, force: true }));
  await fsp.mkdir(path.join(target, 'etc', 'config'), { recursive: true });
  await fsp.writeFile(
    path.join(target, 'etc', 'config', 'network'),
    "config device\n\toption name 'br-lan'\n\tlist ports 'eth1'\nconfig interface 'lan'\n\toption device 'br-lan'\n\toption ipaddr '10.0.0.1'\n"
  );
  await fsp.writeFile(
    path.join(target, 'etc', 'config', 'dhcp'),
    "config dnsmasq\n\toption leasefile '/mnt/wifi5/dhcp.leases'\n"
  );
  return target;
}

test('staging refuses a rootfs that still contains the opaque legacy core', async (t) => {
  const target = await tempRoot(t);
  await fsp.mkdir(path.join(target, 'soft'), { recursive: true });
  await fsp.writeFile(path.join(target, 'soft', 'index.o'), 'legacy');

  await assert.rejects(
    stageRootfs({ projectRoot: root, targetRoot: target }),
    /index\.o|legacy core/i
  );
});

test('staging installs only the ETHYLNET node launcher and local SQLite runtime', async (t) => {
  const target = await tempRoot(t);
  const result = await stageRootfs({ projectRoot: root, targetRoot: target });

  const init = await fsp.readFile(path.join(target, 'etc', 'init.d', 'soft'), 'utf8');
  assert.match(init, /\/usr\/bin\/node\s+\/soft\/ethyl-core\/bin\/ethyl-core\.js/);
  assert.match(init, /ETHYL_STATE_ROOT=\/mnt\/wifi5/);
  assert.match(init, /ETHYL_OPENWRT=1/);
  assert.doesNotMatch(init, /index\.o|ngrok|zerotier|https?:\/\//i);

  assert.equal(fs.existsSync(path.join(target, 'soft', 'index.o')), false);
  assert.equal(fs.existsSync(path.join(target, 'soft', 'ethyl-core', 'bin', 'ethyl-core.js')), true);
  assert.equal(fs.existsSync(path.join(target, 'soft', 'ethyl-core', 'src', 'core', 'app.js')), true);
  assert.equal(fs.existsSync(path.join(target, 'soft', 'ethyl-core', 'node_modules', 'sql.js', 'dist', 'sql-wasm.js')), true);
  assert.equal(fs.existsSync(path.join(target, 'soft', 'ethyl-core', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')), true);
  assert.equal(fs.existsSync(path.join(target, 'mnt', 'wifi5', 'ethyl')), true);

  const nftSet = await fsp.readFile(path.join(target, 'usr', 'share', 'nftables.d', 'table-pre', '20-ethyl-access-set.nft'), 'utf8');
  const forward = await fsp.readFile(path.join(target, 'usr', 'share', 'nftables.d', 'chain-pre', 'forward', '20-ethyl-access.nft'), 'utf8');
  const dstnat = await fsp.readFile(path.join(target, 'usr', 'share', 'nftables.d', 'chain-pre', 'dstnat', '20-ethyl-portal.nft'), 'utf8');
  assert.match(nftSet, /set ethyl_authorized_macs/);
  assert.match(nftSet, /type ether_addr/);
  assert.match(nftSet, /flags timeout/);
  assert.match(forward, /@ethyl_authorized_macs/);
  assert.match(forward, /drop/);
  assert.match(dstnat, /tcp dport 80/);
  assert.match(dstnat, /redirect to :80/);
  const pppOptions = await fsp.readFile(path.join(target, 'etc', 'ppp', 'pppoe-server-options'), 'utf8');
  assert.match(pppOptions, /require-chap/);
  assert.doesNotMatch(pppOptions, /radius|plugin/i);
  assert.equal(result.stateRoot, '/mnt/wifi5');
});

test('staged production tree contains no opaque-core fallback or remote tunnel token', async (t) => {
  const target = await tempRoot(t);
  await stageRootfs({ projectRoot: root, targetRoot: target });

  const files = [];
  async function walk(dir) {
    for (const entry of await fsp.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) files.push(full);
    }
  }
  await walk(path.join(target, 'soft', 'ethyl-core'));

  const text = files
    .filter((file) => /\.(?:js|json|sh)$/.test(file) || path.basename(file) === 'package.json')
    .map((file) => fs.readFileSync(file, 'utf8'))
    .join('\n');

  assert.doesNotMatch(text, /\/soft\/index\.o|ngrok|zerotier/i);
});

test('staging moves only the early DHCP leasefile to /tmp while preserving network bytes', async (t) => {
  const target = await tempRoot(t);
  const network = [
    "config device",
    "\toption name 'br-lan'",
    "\toption type 'bridge'",
    "\tlist ports 'eth1'",
    "\tlist ports 'vlan.22'",
    "\tlist ports 'vlan.13'",
    "",
    "config interface 'lan'",
    "\toption device 'br-lan'",
    "\toption proto 'static'",
    "\toption ipaddr '10.0.0.1'",
    "\toption netmask '255.255.224.0'",
    '',
  ].join('\n');
  const dhcp = [
    'config dnsmasq',
    "\toption authoritative '1'",
    "\toption leasefile '/mnt/wifi5/dhcp.leases'",
    "\toption localservice '1'",
    '',
  ].join('\n');

  await fsp.mkdir(path.join(target, 'etc', 'config'), { recursive: true });
  await fsp.writeFile(path.join(target, 'etc', 'config', 'network'), network);
  await fsp.writeFile(path.join(target, 'etc', 'config', 'dhcp'), dhcp);

  await stageRootfs({ projectRoot: root, targetRoot: target });

  const stagedNetwork = await fsp.readFile(path.join(target, 'etc', 'config', 'network'), 'utf8');
  const stagedDhcp = await fsp.readFile(path.join(target, 'etc', 'config', 'dhcp'), 'utf8');
  assert.equal(stagedNetwork, network);
  assert.equal(
    stagedDhcp,
    dhcp.replace("option leasefile '/mnt/wifi5/dhcp.leases'", "option leasefile '/tmp/dhcp.leases'")
  );
});

test('staging rejects a target rootfs with no DHCP config', async (t) => {
  const target = await tempRoot(t);
  await fsp.rm(path.join(target, 'etc', 'config', 'dhcp'));
  await assert.rejects(
    stageRootfs({ projectRoot: root, targetRoot: target }),
    /DHCP config|etc\/config\/dhcp/i
  );
});

test('staging rejects ambiguous persistent DHCP leasefile declarations', async (t) => {
  const target = await tempRoot(t);
  await fsp.mkdir(path.join(target, 'etc', 'config'), { recursive: true });
  await fsp.writeFile(
    path.join(target, 'etc', 'config', 'dhcp'),
    "config dnsmasq\n\toption leasefile '/mnt/wifi5/dhcp.leases'\n\toption leasefile '/mnt/wifi5/dhcp.leases'\n"
  );

  await assert.rejects(
    stageRootfs({ projectRoot: root, targetRoot: target }),
    /ambiguous|exactly one|leasefile/i
  );
});


test('staging installs the WiFi5 bootstrap helper with only target-proven commands', async (t) => {
  const target = await tempRoot(t);
  await stageRootfs({ projectRoot: root, targetRoot: target });
  const installed = path.join(target, 'usr', 'libexec', 'ethyl', 'wifi5-storage-bootstrap.sh');
  const text = await fsp.readFile(installed, 'utf8');
  const mode = (await fsp.stat(installed)).mode & 0o777;
  assert.equal(mode, 0o755);
  assert.doesNotMatch(text, /\b(?:sfdisk|blkid|findmnt|mountpoint|partprobe)\b/);
  for (const command of ['lsblk', 'fdisk', 'partx', 'mkfs.ext4', 'mount', 'umount', 'sync', 'uci', 'logger']) {
    assert.match(text, new RegExp(`\\b${command.replace('.', '\\.') }\\b`));
  }
});
