<script lang="ts">
  import { browsers, type Browser, type Profile, type Registration } from './browser';

  let { profiles, registrations, check, disconnect }: { profiles: Profile[]; registrations: Registration[]; check: () => void; disconnect: (id: string) => void } = $props();
  let confirm = $state<string>();
  const guides = {
    chrome: { page: 'chrome://extensions', package: 'chromium' },
    chromium: { page: 'chrome://extensions', package: 'chromium' },
    brave: { page: 'brave://extensions', package: 'chromium' },
    firefox: { page: 'about:debugging#/runtime/this-firefox', package: 'firefox' },
    zen: { page: 'about:debugging#/runtime/this-firefox', package: 'firefox' },
  } as const;
</script>

<section aria-labelledby="browser-settings">
  <h2 id="browser-settings">Browsers</h2>
  {#if profiles.length === 0}<p>No browsers connected</p>{/if}
  {#each profiles as profile (profile.id)}
    <div class="profile">
      <p><strong>{profile.label}</strong> · {browsers[profile.browser]} · {profile.online ? 'Connected' : 'Disconnected'}</p>
      {#if confirm === profile.id}
        <p>Disconnect this profile? Saved rules stay in focus.</p>
        <button type="button" onclick={() => { disconnect(profile.id); confirm = undefined; }}>Disconnect profile</button>
        <button type="button" onclick={() => confirm = undefined}>Cancel</button>
      {:else}
        <button type="button" onclick={() => confirm = profile.id}>Disconnect</button>
      {/if}
    </div>
  {/each}
  {#each Object.entries(guides) as [id, guide] (id)}
    {@const registration = registrations.find((record) => record.browser === id)}
    <details>
      <summary>{browsers[id as Browser]} <span>Install / Connect</span></summary>
      <ol>
        {#if guide.package === 'chromium'}
          <li>In a disposable profile, open <code>{guide.page}</code>. Load the unpacked <code>focus-chromium.zip</code> from this build using Load unpacked.</li>
        {:else}
          <li>In a disposable profile, open <code>{guide.page}</code>. Choose Load Temporary Add-on and select <code>focus-firefox.zip</code> from this build.</li>
        {/if}
        <li>Build the local bridge from the repository root: <code>cargo build --locked --manifest-path apps/desktop/src-tauri/Cargo.toml --bin focus-native-host</code>.</li>
        {#if registration?.manifestPath}
          <li>{registration.matched ? 'Matching registration found' : 'Matching registration not found'} at <code>{registration.manifestPath}</code>. This checks only the file, not the connection.</li>
          {#if registration.manifest}
            <li>
              In the disposable test environment, save this JSON as <code>com.focus_local.bridge.json</code>.
              {#if guide.package === 'chromium'}
                If the browser was launched with a separate user-data directory, use its <code>NativeMessagingHosts</code> subdirectory.
              {:else}
                Use the directory shown above in the disposable home. Firefox and Zen can share the Mozilla manifest; verify pairing separately.
              {/if}
              Don’t overwrite an existing manifest.
              <pre>{registration.manifest}</pre>
            </li>
          {:else}
            <li>This build does not have a Chromium store identity. Use the local debug build for the packaged test extension.</li>
          {/if}
        {:else}
          <li>Registration paths and manifest templates are available in the local macOS and Linux desktop builds.</li>
        {/if}
        <li>Open the add-on’s Browser setup, choose {browsers[id as Browser]}, then Connect to focus. Confirm the profile label here.</li>
      </ol>
    </details>
  {/each}
  <button type="button" onclick={check}>Check browser registrations</button>
</section>

<style>
  section { margin-block-start: 16px; }
  h2, p { margin: 0 0 4px; overflow-wrap: anywhere; }
  h2 { font-size: 15px; }
  p, ol { color: var(--muted); }
  details, .profile { border-block-end: 1px solid var(--divider); padding-block: 8px; }
  summary { min-height: 32px; cursor: pointer; }
  summary span { color: var(--muted); margin-inline-start: 8px; }
  ol { margin: 4px 0; padding-inline-start: 24px; }
  li + li { margin-block-start: 6px; }
  code { font-family: var(--font-code); overflow-wrap: anywhere; }
  pre { white-space: pre-wrap; overflow-wrap: anywhere; border-inline-start: 2px solid var(--divider); padding-inline-start: 8px; font-family: var(--font-code); }
  button { font: inherit; color: inherit; padding: 6px 8px; margin: 4px 6px 0 0; border: 1px solid var(--edge); border-radius: var(--radius-control); background: var(--surface); }
  button:hover { color: var(--canvas); background: var(--ink); cursor: pointer; }
  button:focus-visible, summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
</style>
