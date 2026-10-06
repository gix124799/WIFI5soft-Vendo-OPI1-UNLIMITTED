'use strict';

const fs = require('node:fs');
const path = require('node:path');

function readText(targetRoot, relative) {
  try {
    return fs.readFileSync(path.join(targetRoot, relative), 'utf8');
  } catch (_error) {
    return '';
  }
}

function exists(targetRoot, relative) {
  try {
    return fs.existsSync(path.join(targetRoot, relative));
  } catch (_error) {
    return false;
  }
}

function executable(targetRoot, relative) {
  try {
    const mode = fs.statSync(path.join(targetRoot, relative)).mode & 0o111;
    return mode !== 0;
  } catch (_error) {
    return false;
  }
}

function verifyRootfsContract({ targetRoot } = {}) {
  if (!targetRoot || typeof targetRoot !== 'string') {
    throw new TypeError('targetRoot is required');
  }
  const root = path.resolve(targetRoot);
  const network = readText(root, 'etc/config/network');
  const dhcp = readText(root, 'etc/config/dhcp');
  const dropbear = readText(root, 'etc/config/dropbear');
  const admin = readText(root, 'soft/config/admin.locations');
  const nginxLocations = readText(root, 'soft/config/nginx.locations');
  const nginxUpstreams = readText(root, 'soft/config/nginx.conf');
  const pppoeLocations = readText(root, 'soft/config/pppoe.locations');
  const portalNft = readText(root, 'usr/share/nftables.d/chain-pre/dstnat/20-ethyl-portal.nft');
  const launcher = readText(root, 'etc/init.d/soft');

  const checks = Object.freeze({
    LAN_10_0_0_1:
      /option\s+name\s+['"]br-lan['"]/.test(network) &&
      /option\s+device\s+['"]br-lan['"]/.test(network) &&
      /option\s+ipaddr\s+['"]10\.0\.0\.1['"]/.test(network),
    LAN_ETH1: /list\s+ports\s+['"]eth1['"]/.test(network),
    DHCP_EARLY_TMP:
      /option\s+leasefile\s+['"]\/tmp\/dhcp\.leases['"]/.test(dhcp) &&
      !/\/mnt\/wifi5\/dhcp\.leases/.test(dhcp),
    PORTAL_REDIRECT_80:
      /iifname\s+['"]br-lan['"]/.test(portalNft) &&
      /tcp\s+dport\s+80/.test(portalNft) &&
      /redirect\s+to\s+:80/.test(portalNft),
    ADMIN_ROUTE:
      /location\s+\/admin(?:\s|\{)/.test(admin) &&
      /location\s+\/(?:\s|\{)/.test(admin) &&
      /@backend/.test(admin),
    BACKEND_3000_3001_3002:
      /(?:localhost|127\.0\.0\.1):3000/.test(nginxUpstreams) &&
      /(?:localhost|127\.0\.0\.1):3001/.test(nginxUpstreams) &&
      /(?:localhost|127\.0\.0\.1):3002/.test(pppoeLocations),
    DROPBEAR_LAN:
      /option\s+enable\s+['"]1['"]/.test(dropbear) &&
      /option\s+Interface\s+['"]lan['"]/.test(dropbear),
    STORAGE_BOOTSTRAP:
      executable(root, 'usr/libexec/ethyl/wifi5-storage-bootstrap.sh') &&
      /\/usr\/libexec\/ethyl\/wifi5-storage-bootstrap\.sh/.test(launcher),
    CLEAN_ROOM_ONLY:
      !exists(root, 'soft/index.o') &&
      /\/usr\/bin\/node/.test(launcher) &&
      /\/soft\/ethyl-core\/bin\/ethyl-core\.js/.test(launcher) &&
      !/index\.o/.test(launcher),
    UI_STATIC_ROOT:
      /root\s+\/soft\/ethyl-core\/public;/.test(nginxLocations) &&
      !/\/tmp\/i\/public/.test(nginxLocations) &&
      /location\s+=\s+\/\s*\{/.test(nginxLocations) &&
      /try_files\s+\/index\.html\s+@backend;/.test(nginxLocations) &&
      /location\s+=\s+\/admin\s*\{/.test(nginxLocations) &&
      /try_files\s+\/admin\/index\.html\s+@backend;/.test(nginxLocations) &&
      exists(root, 'soft/ethyl-core/public/index.html') &&
      exists(root, 'soft/ethyl-core/public/portal.css') &&
      exists(root, 'soft/ethyl-core/public/portal.js') &&
      exists(root, 'soft/ethyl-core/public/admin/index.html') &&
      exists(root, 'soft/ethyl-core/public/admin.css') &&
      exists(root, 'soft/ethyl-core/public/admin.js'),
    CAPTIVE_PROBES:
      ['/generate_204', '/hotspot-detect.html', '/connecttest.txt', '/ncsi.txt', '/canonical.html']
        .every((probe) => nginxLocations.includes(`location = ${probe} { return 302 http://10.0.0.1/; }`)),
  });

  return Object.freeze({
    ok: Object.values(checks).every(Boolean),
    checks,
  });
}

function runCli(argv = process.argv.slice(2)) {
  const targetRoot = argv[0];
  if (!targetRoot) {
    process.stderr.write('usage: verify-rootfs-contract.js TARGET_ROOT\n');
    return 2;
  }
  let result;
  try {
    result = verifyRootfsContract({ targetRoot });
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    return 2;
  }
  for (const [name, ok] of Object.entries(result.checks)) {
    process.stdout.write(`${name}=${ok ? 'PASS' : 'FAIL'}\n`);
  }
  process.stdout.write(`OVERALL=${result.ok ? 'PASS' : 'FAIL'}\n`);
  return result.ok ? 0 : 1;
}

if (require.main === module) {
  process.exitCode = runCli();
}

module.exports = {
  verifyRootfsContract,
  runCli,
};
