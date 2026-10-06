'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

async function copyFile(source, destination, mode) {
  await fsp.mkdir(path.dirname(destination), { recursive: true });
  await fsp.copyFile(source, destination);
  if (mode !== undefined) await fsp.chmod(destination, mode);
}

async function copyTree(source, destination) {
  await fsp.mkdir(destination, { recursive: true });
  for (const entry of await fsp.readdir(source, { withFileTypes: true })) {
    const src = path.join(source, entry.name);
    const dst = path.join(destination, entry.name);
    if (entry.isDirectory()) await copyTree(src, dst);
    else if (entry.isFile()) await copyFile(src, dst);
  }
}

async function prepareEarlyDhcp(targetRoot) {
  const dhcpPath = path.join(targetRoot, 'etc', 'config', 'dhcp');
  let text;
  try {
    text = await fsp.readFile(dhcpPath, 'utf8');
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      throw new Error('target rootfs DHCP config /etc/config/dhcp is required');
    }
    throw error;
  }

  const persistent = "option leasefile '/mnt/wifi5/dhcp.leases'";
  const matches = text.split(persistent).length - 1;
  if (matches !== 1) {
    throw new Error(`expected exactly one persistent DHCP leasefile declaration, found ${matches}`);
  }

  const staged = text.replace(persistent, "option leasefile '/tmp/dhcp.leases'");
  await fsp.writeFile(dhcpPath, staged);
}

async function stageRootfs(options = {}) {
  const projectRoot = path.resolve(options.projectRoot || path.resolve(__dirname, '..', '..'));
  const targetRoot = path.resolve(options.targetRoot || '');
  if (!options.targetRoot) throw new TypeError('targetRoot is required');

  const legacyCore = path.join(targetRoot, 'soft', 'index.o');
  if (fs.existsSync(legacyCore)) {
    throw new Error('legacy core /soft/index.o must be removed before ETHYLNET staging');
  }

  await prepareEarlyDhcp(targetRoot);

  const appRoot = path.join(targetRoot, 'soft', 'ethyl-core');
  await fsp.mkdir(appRoot, { recursive: true });
  await copyTree(path.join(projectRoot, 'bin'), path.join(appRoot, 'bin'));
  await copyTree(path.join(projectRoot, 'src'), path.join(appRoot, 'src'));
  await copyFile(path.join(projectRoot, 'package.json'), path.join(appRoot, 'package.json'));
  await copyFile(path.join(projectRoot, 'package-lock.json'), path.join(appRoot, 'package-lock.json'));

  const sqlRoot = path.join(projectRoot, 'node_modules', 'sql.js');
  const targetSqlRoot = path.join(appRoot, 'node_modules', 'sql.js');
  await copyFile(path.join(sqlRoot, 'package.json'), path.join(targetSqlRoot, 'package.json'));
  await copyFile(path.join(sqlRoot, 'dist', 'sql-wasm.js'), path.join(targetSqlRoot, 'dist', 'sql-wasm.js'));
  await copyFile(path.join(sqlRoot, 'dist', 'sql-wasm.wasm'), path.join(targetSqlRoot, 'dist', 'sql-wasm.wasm'));

  await copyFile(
    path.join(projectRoot, 'integration', 'openwrt', 'soft.init'),
    path.join(targetRoot, 'etc', 'init.d', 'soft'),
    0o755
  );

  await copyFile(
    path.join(projectRoot, 'integration', 'openwrt', 'pppoe-server-options'),
    path.join(targetRoot, 'etc', 'ppp', 'pppoe-server-options'),
    0o600
  );

  const nftRoot = path.join(projectRoot, 'integration', 'openwrt', 'nftables');
  await copyFile(
    path.join(nftRoot, 'table-pre', '20-ethyl-access-set.nft'),
    path.join(targetRoot, 'usr', 'share', 'nftables.d', 'table-pre', '20-ethyl-access-set.nft'),
    0o644
  );
  await copyFile(
    path.join(nftRoot, 'chain-pre', 'forward', '20-ethyl-access.nft'),
    path.join(targetRoot, 'usr', 'share', 'nftables.d', 'chain-pre', 'forward', '20-ethyl-access.nft'),
    0o644
  );
  await copyFile(
    path.join(nftRoot, 'chain-pre', 'dstnat', '20-ethyl-portal.nft'),
    path.join(targetRoot, 'usr', 'share', 'nftables.d', 'chain-pre', 'dstnat', '20-ethyl-portal.nft'),
    0o644
  );

  await fsp.mkdir(path.join(targetRoot, 'mnt', 'wifi5', 'ethyl'), { recursive: true });

  return Object.freeze({
    targetRoot,
    appRoot: '/soft/ethyl-core',
    stateRoot: '/mnt/wifi5',
    launcher: '/etc/init.d/soft',
  });
}

module.exports = {
  stageRootfs,
};
