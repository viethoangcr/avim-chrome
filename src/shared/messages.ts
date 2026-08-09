// type alias (not interface) so it carries an implicit index signature and
// stays assignable to chrome.storage's Record<string, unknown> payloads
export type Prefs = { method: number; onOff: number; ckSpell: number; oldAccent: number };
export type GetPrefsMessage   = { type: 'get_prefs' };
export type SavePrefsMessage  = { type: 'save_prefs'; prefs: Partial<Prefs> };
export type TurnAvimMessage   = { type: 'turn_avim' };
export type PrefsPushMessage  = { type: 'prefs'; prefs: Prefs };   // background → content (tab push)
export type RequestMessage    = GetPrefsMessage | SavePrefsMessage | TurnAvimMessage;
