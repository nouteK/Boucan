/**
 * Protocol versioning.
 *
 * PROTOCOL_VERSION is an integer bumped ONLY on breaking changes (renamed or
 * removed message/field, changed meaning, stricter validation of an existing
 * field). Client and server must agree on it: the server refuses a `hello`
 * carrying another version with PROTOCOL_MISMATCH.
 *
 * CONTRACT_REVISION tracks additive, backward-compatible changes (new optional
 * field, new message type, new error code, new event kind). Its major part is
 * always PROTOCOL_VERSION. Clients must ignore unknown fields, events and
 * message types so additive changes never break them.
 *
 * Every change is logged in docs/handoff/CLAUDE_TO_ASTRA.md and CHANGELOG.md.
 */
export const PROTOCOL_VERSION = 1;
export const CONTRACT_REVISION = '1.0.0';
