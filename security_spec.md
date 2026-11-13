# HAUNTED MAP Security Specification

## 1. Data Invariants
1. **PII Isolation**: User email addresses are stored exclusively in `/usersPrivate/{userId}` and are readable only by the owning user (`request.auth.uid == userId`) or an administrator. Public profiles in `/userProfiles/{userId}` never store PII.
2. **Role Escalation Prevention**: Users cannot assign themselves `role: 'admin'` or clear `suspended: true` on `/userProfiles/{userId}`, nor write to `/admins/{userId}`.
3. **Moderation Gate**: Public users can only `get` or `list` `/locations/{locationId}` documents where `status == 'approved'`. Pending, rejected, or AI-draft submissions are visible only to the submitting owner or admins.
4. **Submission Integrity**: Newly created locations by non-admin users must have `status == 'pending'`, `featured == false`, `isAiDiscovered == false`, `submittedBy == request.auth.uid`, and server timestamps matching `request.time`.
5. **Relational Review Gate**: Reviews in `/locations/{locationId}/reviews/{reviewId}` can only be created for an `approved` parent location (`get(.../locations/$(locationId)).data.status == 'approved'`).
6. **Verified Email Requirement**: Standard user writes require `request.auth.token.email_verified == true`.
7. **Temporal & Immutable Integrity**: `createdAt`, `submittedBy`, `userId`, `authorId`, `locationId`, and `participantIds` are immutable once created. `updatedAt` must match `request.time`.
8. **Private Messaging Isolation**: Conversations (`/conversations/{conversationId}`) and messages (`/conversations/{conversationId}/messages/{messageId}`) are readable and writable strictly by UIDs listed in `participantIds`, with zero `get()` calls in `allow list`.
9. **Social & Notification Boundaries**: Users can only create/delete their own `postLikes`, `savedPosts`, `follows` (never self-follow), and mark only their own `notifications` as read.

## 2. Adversarial Security Test Matrix
1. **Unverified Admin Email Spoof**: User with `email: 'abhiislam676@gmail.com'` and `email_verified: false` tries to approve a location -> `PERMISSION_DENIED`.
2. **Self-Assigned Admin Role**: New user registers `/userProfiles/{uid}` with `role: 'admin'` -> `PERMISSION_DENIED`.
3. **Shadow Field Injection on Create**: User creates location or post with extra ghost key -> `PERMISSION_DENIED`.
4. **Pending Location Auto-Publish**: User submits `/locations/{id}` with `status: 'approved'` -> `PERMISSION_DENIED`.
5. **Owner Editing Approved Location Directly**: Non-admin user attempts to mutate an already `approved` location -> `PERMISSION_DENIED`.
6. **Public Scraping of Pending Submissions**: Unauthenticated or third-party user queries `/locations` with `status == 'pending'` -> `PERMISSION_DENIED`.
7. **PII Blanket Read**: Signed-in user reads `/usersPrivate/{otherUid}` -> `PERMISSION_DENIED`.
8. **ID Poisoning**: Attacker writes document with invalid ID containing slashes/spaces -> `PERMISSION_DENIED`.
9. **Spoofed Timestamp**: Client sends backdated `createdAt` not equal to `request.time` -> `PERMISSION_DENIED`.
10. **Review on Pending Location**: User posts review under an unapproved location -> `PERMISSION_DENIED`.
11. **Oversized Array / Denial of Wallet**: User submits `images` array with 50 entries or 100KB payload -> `PERMISSION_DENIED`.
12. **Unsuspending Own Account**: Suspended user updates `/userProfiles/{uid}` with `suspended: false` -> `PERMISSION_DENIED`.
13. **Cross-User DM Eavesdropping**: User `u3` attempts to list or read messages in conversation `[u1, u2]` -> `PERMISSION_DENIED`.
14. **Self-Follow Spoof**: User `u1` attempts to create `/follows/u1_u1` -> `PERMISSION_DENIED`.
15. **Notification Forgery**: User `u1` creates notification with `actorId: 'u2'` or reads `u2`'s notifications -> `PERMISSION_DENIED`.
