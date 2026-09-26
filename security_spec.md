# Security Specification: Timesheet & Studio Management

This security specification establishes the zero-trust boundaries, data invariants, and access control policies for the Toki Kobo Studio system, incorporating the new Timesheets & Salary Calculator rules.

## 1. Data Invariants

1. **Self-Service / Self-Registration Locking**: Users cannot self-upgrade their user profile roles or branch assignments. Only authenticated administrators can write or modify personnel information and active roles.
2. **PII and Salary Isolation**: Personally Identifiable Information (PII) and staff compensation calculations are confidential. Only authenticated administrators or verified domain accounts (`*@tokikobo.com`) can read, create, or update staff timesheets.
3. **Temporal Invariants**: All system audit logs and last modification stamps (`createdAt`, `lastUpdated`, `timestamp`) must adhere to strict temporal checks.
4. **ID Sanitization**: Document IDs must be within safe length ranges (e.g. `<= 128` characters) and conform strictly to safe alphanumeric characters.

---

## 2. The "Dirty Dozen" Threat Model Payloads

Below are twelve malicious payloads designed to breach access controls, execute identity spoofing, bypass schema constraints, or cause resource exhaustion. All must be rejected (`PERMISSION_DENIED`) by the rules.

### T1: Self-Service Administrator Promotion (Identity Spoofing)
An authenticated standard user attempts to register their own profile as an administrative account.
```json
// Path: /users/attacker-uid
{
  "uid": "attacker-uid",
  "email": "malicious@gmail.com",
  "branch": "ALL",
  "role": "admin"
}
```

### T2: Salary / Hourly Rate Manipulation (State Bypass)
A standard staff member tries to update their own timesheet's hourly rate to RM999.00.
```json
// Path: /timesheets/staff123_2026-06
{
  "staffId": "staff123",
  "staffName": "Standard Staff",
  "month": "2026-06",
  "hourlyRate": 999.0,
  "entries": {},
  "createdAt": "2026-06-28T04:10:52Z",
  "lastUpdated": "2026-06-28T04:10:52Z"
}
```

### T3: Email Spoofing Attack
An unverified user tries to access administrator paths with an unverified email claiming to be `admin@tokikobo.com`.
```json
// Auth Context: { uid: "spoof-uid", token: { email: "admin@tokikobo.com", email_verified: false } }
```

### T4: Cross-Branch Unauthorized Product Creation
A staff member verified ONLY in Penang (`PG`) attempts to create an inventory item for Bukit Mertajam (`BM`).
```json
// Path: /products/malicious-prod
{
  "name": "Intrusion Vase",
  "price": 25.0,
  "stock": 100,
  "location": "BM",
  "category": "sale",
  "sku": "INT-BM-01"
}
```

### T5: Timesheet Document ID Poisoning (Resource Exhaustion)
An attacker injects a 2MB base64 string or complex escape sequence as a document ID to compromise indexing performance.
```json
// Path: /timesheets/LONG_BLOB_A_A_A_... (size > 128 chars)
```

### T6: Booking Status Terminal Lock Bypass
An attacker tries to revert a completed booking back to "pending" to avoid paying balances.
```json
// Action: Revert completed booking status
```

### T7: Transaction Deletion by Standard Non-Admin User
A standard staff member tries to execute a direct delete on a financial receipt document.
```json
// Path: /transactions/tx-999
```

### T8: Malformed Timesheet Type-Safety Injection
An attacker inserts a malicious string array instead of a structured timesheet map under `entries`.
```json
// Path: /timesheets/staff_month
{
  "staffId": "staff123",
  "staffName": "Staff Name",
  "month": "2026-06",
  "hourlyRate": 15,
  "entries": ["MALICIOUS_STRING_ARRAY"],
  "createdAt": "2026-06-28T11:11:00Z",
  "lastUpdated": "2026-06-28T11:11:00Z"
}
```

### T9: Ghost Field Shadow Injection (The "Shadow Update")
An attacker sends a valid timesheet payload including a ghost field `isAdmin: true` to bypass subsequent gates.
```json
// Path: /timesheets/staff_month
{
  "staffId": "staff123",
  "staffName": "Staff Name",
  "month": "2026-06",
  "hourlyRate": 15,
  "entries": {},
  "createdAt": "2026-06-28T11:11:00Z",
  "lastUpdated": "2026-06-28T11:11:00Z",
  "isAdmin": true
}
```

### T10: Anonymous Public Write to Bank Configuration
An anonymous user tries to write a custom initial balance to the bank configuration collection.
```json
// Path: /bankConfig/balance_setup
```

### T11: Cross-Staff Timesheet Peeking
An authenticated standard staff member attempts to read another employee's private timesheet records.
```json
// Path: /timesheets/another_staff_id_month
```

### T12: Negative Expense or Transaction Value Injection
An attacker inserts a negative expenditure value to artificially inflate balance figures.
```json
// Path: /expenses/exp_999
{
  "description": "Negative Expense",
  "amount": -500.0,
  "category": "Supplies",
  "location": "BM"
}
```

---

## 3. Test Runner Configuration (firestore.rules.test.ts)

All tests verify that these payloads fail with proper authorization blocks. We secure rules defensively and prioritize Zero-Trust parameters.
