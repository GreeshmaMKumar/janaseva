# JANASEVA AI — Firestore Security Specification

## 1. Data Invariants
1. **Identity Integrity**: Every user profile (`users/{uid}`), complaint (`complaints/{id}`), agent execution trace (`agent_logs/{id}`), feedback record (`feedback/{id}`), and audit record (`audit_logs/{id}`) must bind its creator/owner UID strictly to `request.auth.uid` on creation and preserve immutability afterward.
2. **Privilege Isolation (Anti-Self-Promotion)**: Standard users creating their own profile (`users/{uid}`) are strictly restricted to `role: "citizen"`. Only the verified bootstrapped administrator (`codewithgreeshma26@gmail.com`) or an existing verified administrator can assign `officer` or `admin` roles.
3. **Referential Integrity**: Every complaint must reference an existing department document (`/departments/{departmentId}`), and every `agent_logs` or `feedback` document must reference an existing complaint (`/complaints/{complaintId}`).
4. **Terminal State Locking**: Once a complaint reaches `status == "Closed"`, non-admin mutations are blocked.
5. **Temporal Integrity**: All `createdAt` and `updatedAt` fields must equal `request.time` via Firestore `serverTimestamp()`.
6. **PII Isolation**: User profile documents containing email, phone, and address fields are readable only by the profile owner or an administrator.
7. **Authorized Officer Department Isolation**: Government Officers can `get`, `list`, and `update` only complaints assigned to their authorized `departmentId` (or directly assigned/headed/created by them), never arbitrary departments.
8. **Firebase Storage Evidence Protection**: Complaint evidence files under `complaints/{citizenUid}/{complaintId}/{fileName}` require verified authentication (`email_verified == true`), `image/*` content type, and `<= 5MB` size (`storage.rules`).

## 2. Adversarial "Dirty Dozen" Payloads Blocked by Rules
1. **Self-Role Escalation**: Citizen submits `users/{uid}` with `role: "admin"` -> **REJECTED** (`incoming().role == 'citizen'`).
2. **Ghost Field Injection**: Citizen submits `complaints/{id}` with extra field `isVerifiedByCommissioner: true` -> **REJECTED** (`data.keys().hasOnly(...)`).
3. **Cross-Tenant Complaint Creation**: Attacker creates complaint with `citizenUid: "victim_uid"` -> **REJECTED** (`incoming().citizenUid == request.auth.uid`).
4. **Orphaned Department Routing**: Complaint created referencing nonexistent `departmentId: "fake-dept"` -> **REJECTED** (`exists(.../departments/...)`).
5. **Citizen Self-Approval**: Citizen updates their own complaint to `status: "Resolved"` and `departmentApproved: true` -> **REJECTED** (`affectedKeys().hasOnly(...)`).
6. **Post-Closure Tampering**: Officer attempts to alter `resolutionNotes` after `status == "Closed"` -> **REJECTED** (`existing().status != 'Closed'`).
7. **Unverified Email Spoofing**: Request with `email == "codewithgreeshma26@gmail.com"` and `email_verified: false` -> **REJECTED** (`isVerified()`).
8. **Payload Exhaustion (1MB Attack)**: Complaint submitted with 500KB `description` or oversized `photoDataUrl` -> **REJECTED** (`.size()` bounds on all strings).
9. **ID Poisoning**: Document ID with path traversal or 500-char junk string -> **REJECTED** (`isValidId()` regex & length check).
10. **PII Scraping**: Signed-in non-admin runs `list` on `/users` -> **REJECTED** (`allow list: if isAdmin()`).
11. **Backdated Timestamp Forgery**: Client passes past `createdAt` timestamp instead of `serverTimestamp()` -> **REJECTED** (`incoming().createdAt == request.time`).
12. **Cross-Department Officer Access & Log Erasure**: Officer from `dept-roads` attempts to `get` or `update` a `dept-water` complaint, or user attempts `delete` on `/agent_logs/{id}` -> **REJECTED** (`isOfficerForComplaint(existing())`, `allow update, delete: if false`).

