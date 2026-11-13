// Security test specification verifying adversarial payloads against firestore.rules
export const dirtyDozenSecurityAssertions = [
  {
    name: '1. Unverified admin email spoof blocked',
    auth: { uid: 'spoof1', email: 'abhiislam676@gmail.com', email_verified: false },
    operation: 'update /locations/loc1 { status: "approved" }',
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '2. Self-assigned admin role blocked',
    auth: { uid: 'u1', email: 'u1@example.com', email_verified: true },
    operation: 'create /userProfiles/u1 { role: "admin" }',
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '3. Shadow field injection blocked',
    auth: { uid: 'u1', email: 'u1@example.com', email_verified: true },
    operation: 'create /locations/loc2 { ..., ghostField: true }',
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '4. User auto-approving own submission blocked',
    auth: { uid: 'u1', email: 'u1@example.com', email_verified: true },
    operation: 'create /locations/loc3 { status: "approved" }',
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '5. Non-admin editing approved location blocked',
    auth: { uid: 'u1', email: 'u1@example.com', email_verified: true },
    operation: 'update /locations/approved1 { name: "Tampered" }',
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '6. Public scraping of pending locations blocked',
    auth: null,
    operation: 'list /locations where status == "pending"',
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '7. PII blanket read across usersPrivate blocked',
    auth: { uid: 'u1', email: 'u1@example.com', email_verified: true },
    operation: 'get /usersPrivate/u2',
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '8. ID poisoning blocked by isValidId',
    auth: { uid: 'u1', email: 'u1@example.com', email_verified: true },
    operation: 'create /locations/invalid id with spaces!',
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '9. Backdated timestamp blocked by request.time check',
    auth: { uid: 'u1', email: 'u1@example.com', email_verified: true },
    operation: 'create /locations/loc4 { createdAt: 2020-01-01 }',
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '10. Review on pending location blocked by parent get()',
    auth: { uid: 'u1', email: 'u1@example.com', email_verified: true },
    operation: 'create /locations/pending1/reviews/rev1',
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '11. Oversized array / resource exhaustion blocked',
    auth: { uid: 'u1', email: 'u1@example.com', email_verified: true },
    operation: 'create /locations/loc5 { images: [20 items] }',
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '12. Suspended user self-unsuspending blocked',
    auth: { uid: 'suspended1', email: 's@example.com', email_verified: true },
    operation: 'update /userProfiles/suspended1 { suspended: false }',
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '13. Third-party eavesdropping on private conversation blocked',
    auth: { uid: 'u3', email: 'u3@example.com', email_verified: true },
    operation: 'get /conversations/u1_u2/messages/m1',
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '14. Self-follow blocked',
    auth: { uid: 'u1', email: 'u1@example.com', email_verified: true },
    operation: 'create /follows/u1_u1 { followerId: "u1", followingId: "u1" }',
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '15. Notification actor spoofing blocked',
    auth: { uid: 'u1', email: 'u1@example.com', email_verified: true },
    operation: 'create /notifications/n1 { actorId: "u2", recipientId: "u3" }',
    expected: 'PERMISSION_DENIED',
  },
];
