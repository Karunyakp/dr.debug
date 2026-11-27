# KAIROS Security Specification (Phase 0: Payload-First Security TDD)

## 1. Data Invariants
1. **PII Isolation**: Patient PII (`email`, `phone`, `bloodGroup`, `allergies`, `emergencyContact`, `abhaId`) is isolated under `/users/{userId}/private/{docId}` and readable/writable exclusively by the owning verified user (`request.auth.uid == userId`) or a verified administrator.
2. **No Self-Assigned Privileged Roles**: On `/users/{userId}` creation, standard users can register with `role: "patient"` only unless an admin provisions a clinical/hospital/ambulance/diagnostic role; users cannot escalate `role` on update.
3. **Appointment Ownership & Terminal Locking**: Appointments can only be created with `ownerId == request.auth.uid`, valid `appointmentId` format, server `request.time` timestamps, and cannot be mutated once `status` reaches terminal state (`completed` or `cancelled`) except by an admin.
4. **Emergency Referral Integrity**: Emergency referrals enforce strict schema bounds, immutable `referringDoctorId` and `createdAt`, explicit action-based updates (hospital accept/decline/escalate, ambulance transit status, arrival completion), and terminal locking on `completed`.
5. **Hospital Capacity Verification**: Only verified hospital staff or administrators can update `/hospitals/{hospitalId}` bed counts (`icuAvailable <= icuTotal`, `generalAvailable <= generalTotal`).
6. **Append-Only Audit Trail**: `/auditLogs/{logId}` records are append-only (`update` and `delete` strictly denied).

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Shadow Field Injection on User Create**: `{ uid: "u1", displayName: "A", role: "patient", isAdmin: true, createdAt: serverTimestamp, updatedAt: serverTimestamp }` -> MUST DENY (`hasOnly`).
2. **Self-Assigned Admin Role on Create**: `{ uid: "u1", displayName: "A", role: "admin", createdAt: serverTimestamp, updatedAt: serverTimestamp }` -> MUST DENY.
3. **Role Privilege Escalation on Update**: Changing `role` from `"patient"` to `"hospital"` on `/users/u1` -> MUST DENY (`affectedKeys().hasOnly`).
4. **Cross-User PII Read**: User B reading `/users/userA/private/info` -> MUST DENY.
5. **Unverified Email Spoofing Admin**: Request with `email == "karunyayashu6@gmail.com"` and `email_verified == false` -> MUST DENY.
6. **ID Poisoning**: Creating `/appointments/../../evil$id` or 200-char ID -> MUST DENY (`isValidId`).
7. **Owner Spoofing on Appointment Create**: User A creating appointment with `ownerId: "userB"` -> MUST DENY.
8. **Client-Spoofed Timestamp**: Creating appointment with client timestamp != `request.time` -> MUST DENY.
9. **Terminal State Mutation**: Modifying an appointment whose `status == "completed"` -> MUST DENY.
10. **Value Poisoning on Referral Update**: Updating `heartRate` to `"999"` (string) or `9999` -> MUST DENY (`isValidReferral`).
11. **Unauthorized Audit Log Tampering**: Updating or deleting `/auditLogs/log-1` -> MUST DENY.
12. **Blanket List Scraping**: Listing `/appointments` without `ownerId == request.auth.uid` filter as non-admin -> MUST DENY.
