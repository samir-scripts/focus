import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.platform === 'linux') {
  const tauri = fileURLToPath(new URL('../apps/desktop/src-tauri/', import.meta.url));
  const cargoTarget = join(tauri, 'target');
  const host = execFileSync('rustc', ['-vV'], { encoding: 'utf8' }).match(/^host: (\S+)$/m)?.[1];
  if (!host) throw new Error('Cannot identify Rust host target');
  const target = process.env.TAURI_ENV_TARGET_TRIPLE || host;
  const cross = target !== host;
  if (!target.includes('-linux-')) process.exit(0);
  const bin = 'focus-browser-policy';
  execFileSync('cargo', ['build', '--locked', '--release', '--target-dir', cargoTarget,
    ...(cross ? ['--target', target] : []), '--features', 'policy-helper', '--bin', bin], { cwd: tauri, stdio: 'inherit' });
  const stage = join(cargoTarget, 'focus-installer', 'native');
  mkdirSync(stage, { recursive: true });
  const artifact = join(stage, bin);
  copyFileSync(join(cargoTarget, ...(cross ? [target] : []), 'release', bin), artifact);
  chmodSync(artifact, 0o755);
}
