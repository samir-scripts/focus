import { invoke } from '@tauri-apps/api/core';

export type GraceOutcome = 'started' | 'busy' | 'rejected' | 'unconfirmed' | 'notApproved'
  | 'missing' | 'incompatible' | 'unsupported';

export function startGraceSession(): Promise<GraceOutcome> {
  return invoke('start_grace');
}

export const graceMessage: Record<GraceOutcome, string> = {
  started: 'Session started in Grace.',
  busy: 'Grace already has a session or a start in progress. Check Grace before trying again.',
  rejected: 'Grace could not start the selected session. Check Grace for details.',
  unconfirmed: 'Could not confirm the start. Check Grace before trying again.',
  notApproved: 'Grace did not allow the start. Choose Allow in Grace when you try again.',
  missing: 'Grace is not installed. Install Grace, then try again.',
  incompatible: 'A compatible signed build of Grace and focus. is required to start a session.',
  unsupported: 'Starting Grace from focus. is not available on this device.',
};
