<script lang="ts">
  import { tick, untrack } from 'svelte';
  import BrowserMark from '@focus/ui/BrowserMark.svelte';
  import { browsers, type Browser, type BrowserBridge, type BrowserScan, type BrowserTarget, type InstallCapability, type InstallOutcome, type Profile } from './browser';

  let { profiles, bridge, disconnect, active }: { profiles: Profile[]; bridge: BrowserBridge | null; disconnect: (id: string) => Promise<void>; active: boolean } = $props();
  let scan = $state.raw<BrowserScan>();
  let scanning = $state(false);
  let scanError = $state(false);
  let busy = $state<string>();
  let confirm = $state<string>();
  let confirmation = $state<HTMLButtonElement>();
  let rescanButton = $state<HTMLButtonElement>();
  let outcome = $state<Record<string, InstallOutcome | 'error' | 'conflict' | 'stale' | 'rollback'>>({});

  const capabilityText: Partial<Record<InstallCapability, string>> = {
    managedPending: 'Signed setup is managed. If the extension has not appeared, restart this browser.',
    managedCleanup: 'Policy is no longer managed. Finish removing this installation’s local bridge registration.',
    managedOrphan: 'Browser installation is no longer detected. Finish removing its managed setup.',
    missingArtifact: 'Extension release not available. Update focus. when the release is available, then rescan.',
    invalidArtifact: 'This build could not verify its extension release. Reinstall focus. from a trusted source.',
    missingBridge: 'The local bridge is missing. Reinstall focus. from a desktop installer, then rescan.',
    missingAuthorization: 'The trusted focus. policy helper or system authorization is unavailable. Use a supported desktop installer and rescan.',
    managedElsewhere: 'Another system account manages this installation. Use the account that installed the extension to change its policy.',
    sharedTarget: 'These installations share a setup location. Remove the extra copy or use a different browser.',
    conflictingSetup: 'Existing setup conflicts with focus. No files were changed.',
    missingPortal: 'The browser extension portal is unavailable. Start your desktop portal and rescan, or use a native browser package.',
    unverifiedChannel: 'Automatic setup is not verified for this browser package. Use a supported native installation.',
  };
  const sourceLabel = { bundle: 'macOS app', native: 'Native', snap: 'Snap', flatpak: 'Flatpak', standalone: 'Standalone' };

  const families = $derived((Object.keys(browsers) as Browser[]).map((browser) => ({
    browser, name: browsers[browser], targets: scan?.targets.filter((target) => target.browser === browser) ?? [],
    profiles: profiles.filter((profile) => profile.browser === browser),
  })).filter((family) => family.targets.length || family.profiles.length));

  async function rescan() {
    if (!bridge || scanning) return;
    scanning = true;
    scanError = false;
    try {
      scan = await bridge.scan();
    } catch {
      scanError = true;
    } finally {
      scanning = false;
    }
  }

  $effect(() => {
    if (active) untrack(() => { if (!busy) void rescan(); });
  });

  async function change(target: BrowserTarget, remove: boolean) {
    if (!bridge || busy || scanning || scanError) return;
    busy = target.id;
    try {
      const result = await (remove ? bridge.removeInstallation(target.id) : bridge.install(target.id));
      outcome[target.id] = result;
      if (result === 'signedPending' || result === 'policyRemoved') await rescan();
    } catch (error) {
      outcome[target.id] = error === 'setup_conflict' ? 'conflict' : error === 'target_changed' ? 'stale' :
        error === 'rollback_failed' ? 'rollback' : 'error';
      if (outcome[target.id] === 'stale' || outcome[target.id] === 'rollback') await rescan();
    } finally {
      busy = undefined;
    }
  }

  async function askRemove(id: string) {
    confirm = id;
    await tick();
    confirmation?.focus();
  }

  async function removeProfile(id: string) {
    await disconnect(id);
    confirm = undefined;
    rescanButton?.focus();
  }

  async function cancelRemove(event: MouseEvent) {
    const row = event.currentTarget instanceof HTMLElement ? event.currentTarget.closest('.profile') : null;
    confirm = undefined;
    await tick();
    row?.querySelector('button')?.focus();
  }
</script>

{#if active}
<section aria-labelledby="browser-settings">
  <div class="section-heading">
    <h2 id="browser-settings">Browsers</h2>
    {#if bridge}
      <button type="button" bind:this={rescanButton} aria-disabled={scanning || !!busy}
        onclick={() => { if (!busy) void rescan(); }}>Rescan</button>
    {/if}
  </div>
  <p role="status">
    {#if !bridge || scan?.supported === false}Automatic browser setup is unavailable here.
    {:else if scanning}Looking for installed browsers…
    {:else if scanError}Could not scan for browsers. Select Rescan to try again.
    {:else if scan?.targets.length === 0}No supported browsers detected. Install a browser, then rescan.
    {/if}
  </p>
  {#if !profiles.some((profile) => profile.online)}<p>No browsers connected</p>{/if}
  {#each families as family (family.browser)}
    <div class="family" role="group" aria-label={family.name}>
      {#if family.targets.length === 0}<h3><BrowserMark browser={family.browser} />{family.name}</h3>{/if}
      {#each family.targets as target (target.id)}
        {@const result = outcome[target.id]}
        {@const remove = target.capability === 'managedPending' || target.capability === 'managedCleanup' || target.capability === 'managedOrphan'}
        {@const actionable = remove || target.capability === 'store' || target.capability === 'managed'}
        {@const action = target.capability === 'managedCleanup' || target.capability === 'managedOrphan' ? 'Finish removal' : remove ? 'Remove extension' : result === 'error' || result === 'cancelled' ? 'Retry' : result === 'storeOpened' ? 'Reopen store' : 'Install extension'}
        <div class="row">
          <div>
            <h3><BrowserMark browser={family.browser} />{family.name} <span class="source">{sourceLabel[target.source]}</span></h3>
            {#if target.label !== sourceLabel[target.source]}<p class="label">{target.label}</p>{/if}
            {#if capabilityText[target.capability]}<p>{capabilityText[target.capability]}</p>{/if}
            {#if target.capability === 'managed'}
              <p>Applies to all profiles {target.source === 'bundle' ? 'on this macOS account' : 'for this installation, including other system accounts'}.</p>
              <p>Use Remove extension here to release the policy, then remove the add-on in the browser if it remains.</p>
            {:else if target.capability === 'managedPending'}
              <p>Removing releases the policy for all profiles. Restart the browser, then remove the add-on there if it remains.</p>
            {/if}
            <p role="status" class:problem={result === 'error' || result === 'conflict' || result === 'rollback'}>
              {#if busy === target.id}{remove ? 'Removing policy…' : 'Opening installation…'}
              {:else if result === 'storeOpened'}Approve installation in {family.name}, then open the extension to connect. If you cancel the browser prompt, reopen the store to retry.
              {:else if result === 'signedPending'}Signed installation pending. Restart {family.name}, then open the extension to connect.
              {:else if result === 'policyRemoved'}Policy removed. Restart {family.name}. If the extension remains, remove it in the browser.
              {:else if result === 'cancelled'}Authorization cancelled. No new installation changes were kept.
              {:else if result === 'conflict'}Existing configuration has changed. Rescan before trying again.
              {:else if result === 'stale'}This installation changed. Select it again after rescanning.
              {:else if result === 'rollback'}Could not finish setup or undo every change. Remove the managed policy if listed, then retry.
              {:else if result === 'error'}{remove ? 'Could not remove the policy.' : 'Could not open the installation.'} Try again.
              {/if}
            </p>
          </div>
          {#if actionable}
            <button type="button" aria-label={`${action} in ${family.name}, ${target.label}`}
              aria-disabled={!!busy || scanning || scanError} onclick={() => change(target, remove)}>{action}</button>
          {/if}
        </div>
      {/each}
      {#each family.profiles as profile (profile.id)}
        <div class="profile row">
          <div>
            <p class="label">{profile.label}</p>
            <p>{profile.updateRequired ? 'Update required' : profile.online ? 'Connected' : 'Disconnected'}</p>
            {#if confirm === profile.id}<p>Remove this profile’s connection? Saved rules stay in focus.</p>
            {:else if !profile.online}<p>Open this browser and the focus. extension to reconnect.</p>{/if}
          </div>
          {#if confirm === profile.id}
            <div class="actions">
              <button type="button" bind:this={confirmation} onclick={() => removeProfile(profile.id)}>Remove profile</button>
              <button type="button" onclick={cancelRemove}>Cancel</button>
            </div>
          {:else}
            <button type="button" aria-label={`Remove ${profile.label} profile`} onclick={() => askRemove(profile.id)}>Remove</button>
          {/if}
        </div>
      {/each}
    </div>
  {/each}
</section>
{/if}

<style>
  section { margin-block-start: 16px; }
  .section-heading, .row { display: flex; flex-wrap: wrap; align-items: start; justify-content: space-between; gap: 8px 16px; }
  .section-heading { align-items: center; margin-block-end: 4px; }
  h2, h3, p { margin: 0; overflow-wrap: anywhere; }
  h2, h3 { font-size: 15px; }
  h3 { display: flex; align-items: center; gap: 8px; margin-block-end: 4px; }
  h3 { flex-wrap: wrap; }
  .source { color: var(--muted); font-weight: 400; }
  h3 :global(svg) { flex: none; }
  p { color: var(--muted); max-inline-size: 68ch; }
  .label { color: var(--ink); font-weight: 700; }
  p:empty { display: none; }
  .problem { color: var(--error); }
  .family { border-block-start: 1px solid var(--divider); margin-block-start: 12px; padding-block-start: 8px; }
  .row { padding-block: 8px; min-block-size: 42px; box-sizing: border-box; }
  .row + .row { border-block-start: 1px solid var(--divider); }
  .row > div:first-child { flex: 1 1 22ch; min-inline-size: 0; }
  .actions { display: flex; flex-wrap: wrap; gap: 8px; }
  button { min-block-size: 36px; max-inline-size: 100%; font: inherit; color: var(--ink); padding: 4px 9px; border: 1px solid var(--edge); border-radius: var(--radius-control); background: var(--surface); cursor: pointer; overflow-wrap: anywhere; transition: color var(--motion-hover) var(--ease), background-color var(--motion-hover) var(--ease), transform var(--motion-press) var(--ease); }
  @media (forced-colors: none) {
    .family, .row + .row { position: relative; border-color: transparent; }
    .family::before, .row + .row::before {
      content: ''; position: absolute; inset: -1px 0 auto; height: 3px; pointer-events: none;
      background: var(--ink);
      -webkit-mask: url('./assets/ink-rule.svg') repeat-x -113px center / 223px 3px;
      mask: url('./assets/ink-rule.svg') repeat-x -113px center / 223px 3px;
    }
    .family:nth-of-type(even)::before, .row:nth-of-type(even)::before {
      -webkit-mask-position: -37px center; mask-position: -37px center;
    }
    button { position: relative; }
    button::before {
      content: ''; position: absolute; inset: -2px; pointer-events: none;
      border: 2px solid var(--ink); border-radius: inherit;
      -webkit-mask: url('./assets/ink-rule.svg') repeat left center / 223px 2px;
      mask: url('./assets/ink-rule.svg') repeat left center / 223px 2px;
    }
  }
  button[aria-disabled='true'] { color: var(--muted); cursor: default; }
  button:not([aria-disabled='true']):is(:hover, :active) { color: var(--canvas); background: var(--ink); }
  button:not([aria-disabled='true']):active { transform: translateY(1px); }
  button:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
  @media (prefers-reduced-motion: reduce) { button { transition: none; } button:not([aria-disabled='true']):active { transform: none; } }
  @media (forced-colors: active) { button:focus-visible { outline-color: Highlight; } button[aria-disabled='true'] { color: GrayText; } }
</style>
