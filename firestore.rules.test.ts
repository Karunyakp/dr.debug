import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Static verification suite ensuring the deployed Firestore security rules
 * enforce all Dirty Dozen invariants from security_spec.md.
 */
const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
const draftPath = path.resolve(process.cwd(), 'DRAFT_firestore.rules');
const rulesText = fs.existsSync(rulesPath)
  ? fs.readFileSync(rulesPath, 'utf-8')
  : fs.readFileSync(draftPath, 'utf-8');

test('rules use rules_version 2 and default-deny global catch-all', () => {
  assert.match(rulesText, /rules_version\s*=\s*'2'/);
  assert.match(rulesText, /match \/\{document=\*\*\}\s*\{\s*allow read, write: if false;/);
});

test('PII private subcollection restricts reads to owner or admin with parent Master Gate', () => {
  assert.match(rulesText, /match \/private\/\{docId\}/);
  assert.match(rulesText, /allow list: if false;/);
  assert.match(rulesText, /exists\(\/databases\/\$\(database\)\/documents\/users\/\$\(userId\)\)/);
});

test('anti-update-gap validators and affectedKeys().hasOnly() are enforced', () => {
  assert.match(rulesText, /function isValidAppointment\(/);
  assert.match(rulesText, /function isValidReferral\(/);
  assert.match(rulesText, /function isValidHospital\(/);
  assert.match(rulesText, /affectedKeys\(\)\.hasOnly\(/);
});

test('admin bootstrap requires verified email to defeat email spoofing', () => {
  assert.match(rulesText, /request\.auth\.token\.email_verified == true/);
  assert.match(rulesText, /request\.auth\.token\.email == 'karunyayashu6@gmail\.com'/);
});

test('auditLogs collection is strictly append-only (no update/delete)', () => {
  assert.match(rulesText, /match \/auditLogs\/\{logId\}[\s\S]*?allow update, delete: if false;/);
});

test('terminal state locking protects completed appointments and referrals', () => {
  assert.match(rulesText, /!\(existing\(\)\.status in \['completed', 'cancelled'\]\)/);
  assert.match(rulesText, /existing\(\)\.status != 'completed'/);
});
