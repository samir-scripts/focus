import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const version = '0.8.8';
const archives = {
  'darwin-amd64': '0ad5d935975bdbcd049d110444f6ade47835eec286efe060665d8b30e4d7fd21',
  'darwin-arm64': '03e295be98e1f70cc8a6a2aa1900de37ebc2a09700412f95e80a668c19b45c1b',
  'linux-amd64': '396b1ee30337afd5cac8d2e744dd449674d9691156536363096c1b92d96b291b',
  'linux-arm64': '3aee9fee61b9c5ce9a2b68f415db0806a5e0096e335d0bb4f1fee064932d2124',
  'windows-amd64': 'e14a9efccb845e9f6abce363302eafdc915a8cb348be1d8423269b75ef66bfe7',
  'windows-arm64': 'd27ab0982c52c0e0d8d8922332d72a99a5c1b6a6a329367ce832dd9cf7663514',
};
const host = process.env.TAURI_ENV_PLATFORM ?? process.platform;
const platform = host === 'win32' ? 'windows' : host;
const requested = process.env.TAURI_ENV_ARCH ?? process.arch;
const arches = requested === 'universal' ? ['arm64', 'amd64'] : [{ aarch64: 'arm64', x64: 'amd64', x86_64: 'amd64' }[requested] ?? requested];
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const stage = fileURLToPath(new URL('../apps/desktop/src-tauri/target/focus-glance/', import.meta.url));
const temp = await mkdtemp(join(tmpdir(), 'focus-glance-build-'));
try {
  for (const arch of arches) {
    const target = `${platform}-${arch}`;
    const expected = archives[target];
    if (!expected) throw new Error(`No qualified Glance input for ${target}`);
    const member = platform === 'windows' ? 'glance.exe' : 'glance';
    const leaf = `glance-${target}.${platform === 'windows' ? 'zip' : 'tar.gz'}`;
    const cached = join(stage, leaf);
    await mkdir(dirname(cached), { recursive: true });
    let bytes = await readFile(cached).catch(error => {
      if (error.code !== 'ENOENT') throw error;
      return null;
    });
    if (!bytes) {
      const response = await fetch(`https://github.com/glanceapp/glance/releases/download/v${version}/${leaf}`, { signal: AbortSignal.timeout(60_000) });
      if (!response.ok) throw new Error(`Could not download pinned ${leaf}: ${response.status}`);
      bytes = Buffer.from(await response.arrayBuffer());
    }
    if (digest(bytes) !== expected) throw new Error(`SHA-256 mismatch for ${leaf}`);
    await writeFile(cached, bytes);
    const directory = join(temp, target);
    await mkdir(directory);
    execFileSync('tar', ['-xf', cached, '-C', directory, member]);
    const binary = join(stage, `${target}-${member}`);
    await copyFile(join(directory, member), binary);
    if (platform !== 'windows') await chmod(binary, 0o755);
    console.log(`Glance ${version} ${target}: archive ${expected}; executable ${digest(await readFile(binary))}`);
  }
} finally {
  await rm(temp, { force: true, recursive: true });
}
