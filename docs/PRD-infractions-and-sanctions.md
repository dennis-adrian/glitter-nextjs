# PRD: Infractions and Sanctions Management

**Product:** Glitter  
**Date:** 2026-07-21  
**Status:** Planned  
**Scope:** Global administration, participant history, and reservation enforcement

---

## 1. Summary

The current system allows administrators to register infractions from a festival participant table and lets users view those infractions in their history. An initial sanctions data model also exists, but there is no administrative workflow for managing sanctions and no enforcement in the reservation flow.

This implementation will turn that foundation into a complete and auditable disciplinary system that allows administrators to:

- Register global infractions or associate them with a festival.
- Review, edit, resolve, or void infractions without deleting their history.
- Apply one manually approved sanction to one or several infractions belonging to the same participant.
- Apply warnings, bans, and delayed reservation access.
- Limit a sanction to one festival brand or apply it globally.
- Measure sanction validity by calendar time, indefinitely, or by a number of festivals.
- Prevent restrictions from being bypassed through direct server-action calls.
- Show participants the status, reason, validity, and consequences of their infractions and sanctions.

The global administration page will be available at **/dashboard/infractions**, behind the existing **/dashboard** layout, with filtering and pagination performed on the server.

---

## 2. Confirmed Product Decisions

| Topic                               | Decision                                                                                                                    |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Administrative roles                | **admin** and **festival_admin** are equivalent administrators for this module.                                             |
| Module access                       | Only administrators can view the global page or take action on infractions and sanctions.                                   |
| Infraction festival                 | Optional. An infraction may be global or associated with a festival.                                                        |
| Editing                             | Infractions and sanctions are editable, with all material changes audited.                                                  |
| Deletion                            | Disciplinary records are not deleted. Infractions are voided and sanctions are revoked.                                     |
| Sanction approval                   | Always manual. The administrator creating a sanction may approve it in the same flow.                                       |
| Severity automation                 | Severity never creates or approves a sanction automatically.                                                                |
| Sanction-to-infraction relationship | One sanction covers one or several infractions. Each infraction may belong to at most one sanction.                         |
| Resolution on approval              | Approving a sanction automatically resolves all included infractions that are pending or under review.                      |
| Appeals                             | Not included in the first implementation.                                                                                   |
| Duplicates                          | Technical retries are prevented, and possible semantic duplicates generate a warning without blocking legitimate incidents. |
| Festival brand scope                | A sanction can apply globally or only to **glitter**, **festicker**, or **twinkler** festivals.                             |
| Festival already active             | A festival that was already active when the sanction was approved does not qualify.                                         |
| Published festivals                 | **published** does not qualify. Only a later transition to **active** can qualify a festival.                               |
| Festival-based validity             | A festival qualifies when activated and counts toward validity when its final date passes.                                  |
| Scope changes                       | Changing brand scope affects only festivals that qualify in the future. Existing associations are not recalculated.         |
| Reservation delay                   | The waiting period starts at the festival's **reservationsStartDate**.                                                      |

---

## 3. Current State and Problems to Address

### 3.1 Infractions

- The existing registration action accepts a database insert structure directly from the client.
- The action does not authenticate or authorize the administrator inside the action itself.
- It does not verify that the participant belongs to the selected festival.
- The **handled** boolean only represents resolved or unresolved.
- **userGaveNotice** is saved, but **gaveNoticeAt** is not populated.
- The current notice wording is ambiguous.
- The festival participant table loads all infractions for the participant instead of only those associated with that festival.
- There is no global administration page, review workflow, editing flow, internal notes, or evidence.
- Infraction types and festivals currently use cascading deletion that can remove disciplinary history.

### 3.2 Sanctions

- Each sanction currently has one required **infractionId**.
- There is no interface for creating, editing, approving, revoking, or displaying sanctions.
- The **active** boolean cannot represent scheduled, expired, or revoked sanctions.
- A single duration and duration unit cannot represent both sanction validity and reservation delay.
- There are no start/end dates or responsible administrator fields.
- There is no record of which festivals qualified for a sanction.
- Sanctions are fetched for the participant history but are not displayed.
- No centralized enforcement exists in the reservation flow.

### 3.3 Festivals

- Only the current festival status is stored; the time at which a festival changed to **active** is not recorded.
- **published** exists in the schema and some queries, but does not have a complete lifecycle implementation.
- Normal controls primarily move festivals between **draft** and **active**.
- Sanction qualification requires reliable records of every transition to **active**.

---

## 4. User Stories

### 4.1 Administrator

| ID    | Story                                                                                                                       | Acceptance criteria                                                                                                       |
| ----- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| US-01 | As an administrator, I want to query all infractions with filters and pagination so I can review a large volume of records. | PostgreSQL performs filtering, ordering, counting, and pagination. All records are never loaded into memory.              |
| US-02 | As an administrator, I want to register a global infraction or associate it with a festival.                                | Festival is optional. If selected, the participant must have participated in it.                                          |
| US-03 | As an administrator, I want to detect possible duplicates before saving.                                                    | Identical retries do not create duplicate records, and similar incidents display a warning that can be confirmed.         |
| US-04 | As an administrator, I want to edit an infraction without losing its history.                                               | Each change records the actor, timestamp, changed values, and reason where appropriate.                                   |
| US-05 | As an administrator, I want to review, resolve, or void an infraction.                                                      | Valid transitions are enforced and the infraction is never physically deleted.                                            |
| US-06 | As an administrator, I want to add internal notes and evidence.                                                             | Internal notes are hidden from the participant, and evidence records retain author and timestamp.                         |
| US-07 | As an administrator, I want to apply a sanction to several infractions from the same participant.                           | At least one infraction is required; all belong to the same user, are not voided, and are not linked to another sanction. |
| US-08 | As an administrator, I want to define sanction scope and validity.                                                          | I can choose a brand, global scope, calendar duration, festival count, or indefinite validity.                            |
| US-09 | As an administrator, I want to revoke or edit a sanction without losing history.                                            | The sanction and its relationships remain recorded and the change creates an audit event.                                 |
| US-10 | As an administrator, I want to see which festivals qualified for a sanction.                                                | The detail shows qualification time, reservation eligibility time, and when the festival counted toward expiration.       |

### 4.2 Participant

| ID    | Story                                                                                                     | Acceptance criteria                                                                                              |
| ----- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| US-11 | As a participant, I want to see my infractions and sanctions so I understand my situation.                | History displays severity, status, festival, resolution, sanctions, validity, scope, and consequences.           |
| US-12 | As a participant with a reservation delay, I want to know when I can reserve.                             | The exact eligibility date and time are displayed for the applicable festival.                                   |
| US-13 | As a participant, I should not be able to bypass a sanction through direct navigation or manual requests. | Pages and server mutations use the same central eligibility service.                                             |
| US-14 | As a participant, I want to be notified when my disciplinary situation changes.                           | Relevant creation, modification, resolution, approval, expiration, and revocation events generate notifications. |

---

## 5. Roles and Authorization

### 5.1 Allowed Roles

For this module, an administrator is:

    role === "admin" || role === "festival_admin"

Both roles may:

- Access **/dashboard/infractions**.
- Register and edit infractions.
- Review, resolve, and void infractions.
- Add internal notes and evidence.
- Create, approve, edit, extend, and revoke sanctions.

### 5.2 Security Rules

- The **/dashboard** layout protects navigation, but it does not replace authorization inside every action.
- Every server action retrieves the current user and validates their role.
- Actions accept purpose-built DTOs validated with Zod, never database **$inferInsert** types exposed directly to the client.
- Administrative reads also validate the role, even when called only by server components.
- Reservation actions validate sanctions without trusting client-side state.

---

## 6. Domain Model

### 6.1 Infraction Lifecycle

    pending ------> under_review ------> resolved
       |                  |                   |
       +------------------+---------------> voided

| Status           | Meaning                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------- |
| **pending**      | Registered and waiting for administrative review.                                                 |
| **under_review** | An administrator has started reviewing it.                                                        |
| **resolved**     | An administrative decision has been made, with or without a sanction.                             |
| **voided**       | The record was invalidated due to error or lack of grounds but remains in administrative history. |

Rules:

- Approving a sanction resolves selected infractions in **pending** or **under_review**.
- An already resolved infraction may support a later sanction if it is not linked to another sanction.
- A voided infraction cannot support a sanction.
- Revoking a sanction does not automatically reopen its infractions. An administrator may explicitly reopen them through an audited transition when needed.

### 6.2 Sanction Lifecycle

    scheduled ------> active ------> expired
        |                |
        +----------------+-------> revoked

| Status        | Meaning                                                       |
| ------------- | ------------------------------------------------------------- |
| **scheduled** | Approved with a future start time.                            |
| **active**    | Currently applicable.                                         |
| **expired**   | Ended because of time or completed qualifying festivals.      |
| **revoked**   | Manually ended by an administrator before natural expiration. |

There is no pending-approval status in the first version. The administrator's confirmation creates and approves the sanction in one transaction.

### 6.3 Relationship Between Infractions and Sanctions

    Participant
        |
        +-- Infraction A --+
        +-- Infraction B --+-- Sanction
        +-- Infraction C   |
                           +-- one or several infractions

Cardinality:

- A sanction must be supported by one or several infractions.
- An infraction may have no sanction.
- An infraction may belong to at most one sanction.
- Every infraction in a sanction must belong to the same user as the sanction.

This restriction prevents the same incident from being punished twice. A later administrative event must be represented by a new infraction.

### 6.4 Prior Notice

**userGaveNotice** means only:

> The participant notified the organization before the non-compliance or incident.

It does not mean that the organization notified the participant about the infraction.

For new records:

- **userGaveNotice = true** requires **gaveNoticeAt**.
- **userGaveNotice = false** requires **gaveNoticeAt = null**.

Legacy records may retain **userGaveNotice = true** with an unknown date. The interface must say that the date was not recorded instead of inventing one.

---

## 7. Proposed Data Model

Final names may be adjusted to existing Drizzle conventions, but the responsibilities and constraints must remain.

### 7.1 Enum: infraction_status

    pending | under_review | resolved | voided

### 7.2 Table: infractions

| Field                | Type                 | Rule                                                               |
| -------------------- | -------------------- | ------------------------------------------------------------------ |
| **id**               | serial PK            | —                                                                  |
| **userId**           | integer FK           | Required participant.                                              |
| **typeId**           | integer FK           | Required. Deletion restricted.                                     |
| **festivalId**       | integer FK, nullable | Optional festival. Deletion restricted or archived, never cascade. |
| **description**      | text, nullable       | Incident-specific details.                                         |
| **status**           | enum                 | Defaults to **pending**.                                           |
| **userGaveNotice**   | boolean              | Defaults to false.                                                 |
| **gaveNoticeAt**     | timestamp, nullable  | Required for new records with prior notice.                        |
| **createdByUserId**  | integer FK, nullable | Creating administrator; nullable for legacy data.                  |
| **resolvedAt**       | timestamp, nullable  | Resolution time.                                                   |
| **resolvedByUserId** | integer FK, nullable | Resolving administrator.                                           |
| **resolutionNotes**  | text, nullable       | Resolution explanation according to visibility rules.              |
| **voidedAt**         | timestamp, nullable  | Void time.                                                         |
| **voidedByUserId**   | integer FK, nullable | Administrator who voided it.                                       |
| **voidReason**       | text, nullable       | Required when voiding.                                             |
| **createdAt**        | timestamp            | —                                                                  |
| **updatedAt**        | timestamp            | Updated on every modification.                                     |

The existing **handled** field is removed after backfill:

- **handled = false** becomes **status = pending**.
- **handled = true** becomes **status = resolved**.

### 7.3 Table: infraction_events

This table stores an immutable history of changes.

| Field            | Type                 | Description                                                                      |
| ---------------- | -------------------- | -------------------------------------------------------------------------------- |
| **id**           | serial PK            | —                                                                                |
| **infractionId** | integer FK           | Affected infraction.                                                             |
| **actorUserId**  | integer FK, nullable | Administrator; nullable for migrations and automated processes.                  |
| **eventType**    | enum/text            | created, edited, review_started, resolved, voided, reopened, or sanction_linked. |
| **fromStatus**   | enum, nullable       | Previous status.                                                                 |
| **toStatus**     | enum, nullable       | New status.                                                                      |
| **changes**      | jsonb, nullable      | Old and new values without secrets.                                              |
| **note**         | text, nullable       | Administrative reason.                                                           |
| **createdAt**    | timestamp            | —                                                                                |

### 7.4 Table: infraction_notes

| Field            | Type       | Description             |
| ---------------- | ---------- | ----------------------- |
| **id**           | serial PK  | —                       |
| **infractionId** | integer FK | —                       |
| **authorUserId** | integer FK | Administrator.          |
| **content**      | text       | Required internal note. |
| **createdAt**    | timestamp  | —                       |
| **updatedAt**    | timestamp  | —                       |

Notes are administrative and are never shown to the participant.

### 7.5 Table: infraction_evidence

| Field             | Type           | Description                        |
| ----------------- | -------------- | ---------------------------------- |
| **id**            | serial PK      | —                                  |
| **infractionId**  | integer FK     | —                                  |
| **addedByUserId** | integer FK     | Administrator.                     |
| **label**         | text, nullable | Short description.                 |
| **url**           | text           | Stored file or resource reference. |
| **mimeType**      | text, nullable | Helps render the resource.         |
| **createdAt**     | timestamp      | —                                  |

The first implementation may reuse the existing upload mechanism. This project does not introduce a new storage provider.

### 7.6 Enum: sanction_status

    scheduled | active | expired | revoked

### 7.7 Enum: sanction_festival_scope

    global | glitter | festicker | twinkler

### 7.8 Table: sanctions

| Field                       | Type                 | Rule                                                                |
| --------------------------- | -------------------- | ------------------------------------------------------------------- |
| **id**                      | serial PK            | —                                                                   |
| **userId**                  | integer FK           | Sanctioned participant.                                             |
| **type**                    | enum                 | warning, ban, or reservation_delay.                                 |
| **status**                  | enum                 | Active or scheduled on approval.                                    |
| **description**             | text, nullable       | Reason and instructions.                                            |
| **festivalScope**           | enum                 | Global or a specific brand.                                         |
| **validityDuration**        | integer, nullable    | Positive for non-indefinite units.                                  |
| **validityUnit**            | enum                 | minutes, hours, days, months, years, festivals, or indefinitely.    |
| **startsAt**                | timestamp            | Validity start.                                                     |
| **endsAt**                  | timestamp, nullable  | Calculated for calendar validity; null for festivals or indefinite. |
| **reservationDelayMinutes** | integer, nullable    | Positive and allowed only for reservation_delay.                    |
| **createdByUserId**         | integer FK, nullable | Creating administrator.                                             |
| **approvedByUserId**        | integer FK, nullable | Approving administrator; normally the creator in v1.                |
| **approvedAt**              | timestamp            | Canonical time for future festival qualification.                   |
| **revokedByUserId**         | integer FK, nullable | —                                                                   |
| **revokedAt**               | timestamp, nullable  | —                                                                   |
| **revocationReason**        | text, nullable       | Required on revocation.                                             |
| **createdAt**               | timestamp            | —                                                                   |
| **updatedAt**               | timestamp            | —                                                                   |

Combination rules:

- **validityUnit = indefinitely** requires **validityDuration = null** and **endsAt = null**.
- **validityUnit = festivals** requires **validityDuration > 0** and **endsAt = null** until expiration.
- Calendar units require **validityDuration > 0** and produce **endsAt**.
- **type = reservation_delay** requires **reservationDelayMinutes > 0**.
- Other types require **reservationDelayMinutes = null**.
- A revoked sanction requires responsible administrator, timestamp, and reason.

### 7.9 Table: sanction_infractions

| Field              | Type                 | Rule                                  |
| ------------------ | -------------------- | ------------------------------------- |
| **sanctionId**     | integer FK           | Part of the composite key.            |
| **infractionId**   | integer FK           | Part of the composite key and unique. |
| **linkedByUserId** | integer FK, nullable | Administrator.                        |
| **linkedAt**       | timestamp            | —                                     |

Constraints:

- Composite primary key or unique constraint on **(sanctionId, infractionId)**.
- **UNIQUE(infractionId)** prevents an infraction from belonging to several sanctions.
- The service verifies that all infractions and the sanction have the same **userId**.
- A sanction must retain at least one relationship; this rule is validated inside the transaction.

### 7.10 Table: sanction_events

This table records creation, approval, editing, scope changes, extensions, expiration, revocation, and changes to associated infractions.

Minimum fields:

- **sanctionId**
- **actorUserId**, nullable
- **eventType**
- **fromStatus**, nullable
- **toStatus**, nullable
- **changes**, jsonb nullable
- **note**, nullable
- **createdAt**

### 7.11 Table: festival_status_events

| Field           | Type                 | Description                         |
| --------------- | -------------------- | ----------------------------------- |
| **id**          | serial PK            | —                                   |
| **festivalId**  | integer FK           | —                                   |
| **fromStatus**  | enum, nullable       | —                                   |
| **toStatus**    | enum                 | —                                   |
| **actorUserId** | integer FK, nullable | Administrator or automated process. |
| **createdAt**   | timestamp            | Canonical transition time.          |

Every festival status mutation must go through one central service that records this event.

### 7.12 Table: sanction_festivals

| Field                     | Type                | Description                                         |
| ------------------------- | ------------------- | --------------------------------------------------- |
| **sanctionId**            | integer FK          | —                                                   |
| **festivalId**            | integer FK          | —                                                   |
| **qualifiedAt**           | timestamp           | Time the festival changed to active.                |
| **reservationEligibleAt** | timestamp, nullable | reservationsStartDate plus reservationDelayMinutes. |
| **countedAt**             | timestamp, nullable | Time it counted toward festival-based validity.     |
| **festivalEndAt**         | timestamp, nullable | Effective final date used for counting.             |
| **countsTowardDuration**  | boolean             | Allows exceptional exclusion with an audit reason.  |
| **excludedReason**        | text, nullable      | Required when the festival does not count.          |

There is a unique constraint on **(sanctionId, festivalId)**.

### 7.13 Minimum Indexes

- **infractions(userId, createdAt desc)**
- **infractions(festivalId, createdAt desc)**
- **infractions(typeId, createdAt desc)**
- **infractions(status, createdAt desc)**
- **infractions(userGaveNotice, createdAt desc)**
- **sanctions(userId, status)**
- **sanctions(festivalScope, status)**
- **sanctions(endsAt)** for calendar expiration
- **sanction_infractions(sanctionId)**
- **festival_status_events(festivalId, createdAt desc)**
- **sanction_festivals(sanctionId, countedAt)**
- **sanction_festivals(festivalId)**

Final indexes will be validated with **EXPLAIN** against real queries to avoid redundant indexes.

---

## 8. Infraction Registration and Editing

### 8.1 Global Registration

From **/dashboard/infractions**:

1. The administrator searches for a participant through a limited remote query.
2. They select an infraction type.
3. They may select a festival or leave the infraction global.
4. If a festival is selected, the server verifies an actual participation by the user.
5. They enter incident-specific details, prior-notice status, and notice time where applicable.
6. The server searches for possible duplicates.
7. If matches exist, the interface displays them before allowing explicit confirmation.
8. The action creates the infraction and its **created** event in one transaction.

### 8.2 Registration From a Festival

The existing participant-table form reuses the same secure action:

- User and festival are preselected.
- Festival is required in this context.
- Participation is verified again on the server.
- The specific page path is revalidated after creation.

### 8.3 Duplicate Detection

#### Technical Idempotency

- Each submission includes a unique idempotency key.
- The database prevents the same key from being processed twice.
- Network retries return the original or equivalent result without creating duplicate records.

#### Possible Semantic Duplicate

A record is considered a candidate when a recent infraction has:

- The same user.
- The same type.
- The same festival, including both records having no festival.

The recommended initial window is 24 hours and should remain a configurable constant. A match produces a warning, not a hard block. The administrator can confirm that it is a separate incident, and that confirmation is audited.

### 8.4 Editable Fields

An administrator may correct:

- Infraction type.
- Festival, including assigning or removing one.
- Description.
- Prior-notice status and timestamp.
- Lifecycle status through valid transitions.
- Resolution or void notes.

The participant cannot be changed after creation. An infraction associated with the wrong user must be voided and recreated to avoid moving disciplinary history between people.

### 8.5 Festival Table Context

The participant table at **/dashboard/festivals/[id]/participants** will show only infractions associated with that festival. A separate link will open the participant's global history filtered in **/dashboard/infractions**.

---

## 9. Sanction Registration and Editing

### 9.1 Selecting Infractions

The flow can begin from an infraction or the participant's history:

1. The sanction participant is fixed.
2. If started from an infraction, that infraction is preselected.
3. The administrator searches for other infractions from the same participant with a remote selector.
4. Only non-voided infractions without an existing sanction are available.
5. Each selection shows type, severity, festival or global status, date, and lifecycle status.
6. At least one infraction is required.

### 9.2 Configuration

The administrator defines:

- Sanction type.
- Description and consequence.
- Immediate or future start.
- Calendar, festival-based, or indefinite validity.
- Global or brand-specific scope.
- Reservation delay in minutes when the type is **reservation_delay**.

### 9.3 Confirmation and Approval

The final review displays:

- Affected participant.
- Every included infraction.
- Consequence.
- Start, validity, and scope.
- Reservation access time when calculable.

On confirmation, one transaction:

1. Revalidates authorization and every identifier.
2. Locks or rechecks the selected infractions to prevent concurrent associations.
3. Verifies that all belong to the same user.
4. Creates and approves the sanction.
5. Creates the **sanction_infractions** relationships.
6. Changes pending or under-review infractions to **resolved**.
7. Creates infraction and sanction audit events.
8. Queues or sends the appropriate notification.

### 9.4 Editing

Allowed:

- Edit description, validity, start time, and reservation delay.
- Add eligible infractions from the same participant.
- Remove an incorrect relationship while at least one remains.
- Change brand scope for future qualifying festivals.
- Extend a sanction.
- Revoke with a required reason.

Not allowed:

- Link an already sanctioned infraction.
- Link infractions from different participants.
- Link voided infractions.
- Remove the final infraction without appropriately revoking or replacing the sanction.
- Retroactively recalculate festivals already associated when changing scope.

---

## 10. Qualifying Festivals and Expiration

### 10.1 Qualification Rule

A festival qualifies for a sanction only when all conditions are met:

1. The festival records a real transition to **active**.
2. The transition occurs strictly after **sanction.approvedAt**.
3. The sanction is active or scheduled in a way that applies at that time.
4. The scope is global or matches **festival.festivalType**.
5. The sanction-festival combination does not already exist.

A festival that was already active when the sanction was approved does not qualify. A festival that is only **published** does not qualify.

### 10.2 Association on Festival Activation

The central festival transition service performs in one transaction:

1. Update the festival status.
2. Record a **festival_status_events** entry.
3. Find applicable sanctions.
4. Create idempotent **sanction_festivals** records.
5. Calculate **reservationEligibleAt** for reservation-delay sanctions.

### 10.3 Counting at Festival End

An idempotent recurring process:

1. Finds qualified festivals whose effective final date has passed.
2. Sets **countedAt** and stores the final date used.
3. Counts completed festivals for each sanction.
4. Changes the sanction to **expired** when the count reaches **validityDuration**.
5. Records the event and notifies the participant.

Festivals excluded with **countsTowardDuration = false** do not increase the count and require an audited reason.

### 10.4 Date Changes

- Before counting, the current official final date is used.
- If **reservationsStartDate** changes, **reservationEligibleAt** is recalculated for associations that have not begun, according to festival operating policy, with an audit event.
- Once a festival has counted, its result is not changed automatically.

---

## 11. Reservation Enforcement

### 11.1 Central Eligibility Service

A single service will be implemented conceptually as:

    getReservationEligibility({ userId, festivalId, now })

Minimum result:

    type ReservationEligibility =
      | { eligible: true }
      | {
          eligible: false;
          reason: "ban" | "reservation_delay";
          eligibleAt?: Date;
          sanctionIds: number[];
          message: string;
        };

The service considers:

- Active sanctions.
- Associations with the current festival.
- Global or brand-specific scope.
- Start and expiration dates.
- Revocations.

### 11.2 Warnings

A **warning** does not block actions. It is presented through participant history and notification rules.

### 11.3 Bans

An applicable **ban** blocks access and reservation mutations for its validity period.

### 11.4 Reservation Delay

For each qualifying festival:

    reservationEligibleAt =
      festival.reservationsStartDate + sanction.reservationDelayMinutes

Before that time:

- The reservation page does not allow the participant to continue.
- The exact eligibility date and time are displayed.
- Stand hold, reservation creation, and reservation confirmation actions reject the operation.

After that time, the sanction no longer blocks reservations for that festival, although its validity may continue for future festivals.

### 11.5 Simultaneous Sanctions

If several sanctions apply:

- A ban always takes precedence.
- For several reservation delays, the latest **reservationEligibleAt** is used.
- Every relevant sanction ID is returned for audit and support.

### 11.6 Enforcement Points

Validation is integrated at least into:

- Initial reservation-page access.
- Sector and stand selection.
- Stand-hold creation.
- Reservation confirmation.
- Any administrative action or API that reserves on behalf of a participant, according to the final administrator-override policy.

The interface is informational. The server is always authoritative.

---

## 12. Global Infractions Page

### 12.1 Route and Access

    /dashboard/infractions

- Uses the existing **/dashboard** layout.
- Accepts both administrative roles.
- Is added to desktop and mobile navigation for both roles.

### 12.2 URL Parameters

All filters are validated and shareable through the URL:

- **query**: name, email, or relevant text.
- **userId**
- **festivalId**, including an explicit no-festival option.
- **festivalType**
- **typeId**
- **severity**
- **status**
- **userGaveNotice**
- **hasSanction**
- **sanctionStatus**
- **createdFrom**
- **createdTo**
- **sort**
- **direction**
- **limit**
- **offset**

Invalid values produce a controlled response and never flow directly into SQL.

### 12.3 Query and Pagination

- The server builds the SQL conditions.
- The main query returns only the requested page.
- A separate query returns the filtered total.
- Allowed page sizes are restricted to known values.
- Default ordering is **createdAt desc, id desc** for stability.
- Changing any filter resets **offset** to zero.
- Pagination is never performed in memory.

### 12.4 Presentation

The desktop table shows:

- Participant.
- Type and description.
- Severity.
- Festival or Global.
- Prior-notice status.
- Lifecycle status.
- Related sanction, if present.
- Registration date.
- Actions.

Mobile uses compact cards with the same essential information.

Severity is a consistent visual scanning signal, but never depends on color alone; accessible text is always included.

### 12.5 Review Queue

The page also acts as a review queue through filters or presets:

- Pending.
- Under review.
- Recently resolved.
- Voided.
- With active sanction.
- Without sanction.

---

## 13. Administrative Detail Views

An infraction detail shows:

- Participant and access to complete history.
- Type, severity, and description.
- Festival or global context.
- Prior notice and timestamp.
- Status and resolution.
- Internal notes and evidence.
- Audit events.
- Related sanction, if present.
- Other infractions from the participant.

A sanction detail shows:

- Participant.
- Every supporting infraction.
- Type, status, validity, and scope.
- Reservation delay where applicable.
- Qualified and counted festivals.
- Change history.
- Edit, extend, and revoke actions.

---

## 14. Participant Experience

The existing **/profiles/[profileId]/infractions** page will be expanded to display:

- Severity with text and visual treatment.
- Infraction lifecycle status.
- Festival or global context.
- Date and description.
- Visible resolution information.
- The related sanction without duplicating it when it covers several infractions.
- Sanction type, status, start, end, and scope.
- Remaining festivals for festival-based validity.
- Reservation eligibility time for the applicable festival.
- Clear and actionable consequences.

Internal notes and administrative audit metadata are never shown to the participant.

---

## 15. Notifications

| Event                         | Participant                                | Administrators             |
| ----------------------------- | ------------------------------------------ | -------------------------- |
| Infraction registered         | Yes                                        | Optional                   |
| Infraction materially edited  | Yes                                        | Not required for the actor |
| Infraction resolved or voided | Yes                                        | Optional                   |
| Sanction approved             | Yes                                        | Optional                   |
| Sanction edited or extended   | Yes                                        | Optional                   |
| Sanction about to start       | Optional                                   | Optional                   |
| Sanction expired              | Yes                                        | Optional                   |
| Sanction revoked              | Yes                                        | Optional                   |
| Reservation access enabled    | Yes, if a scheduled mechanism is available | No                         |

The implementation reuses the existing email/notification system. A single sanction event generates one notification summarizing all related infractions; it does not send one duplicate notification per relationship.

---

## 16. Mutations and Transactions

The following operations must be transactional:

- Create infraction, event, and idempotency record.
- Edit infraction and create event.
- Change lifecycle status with resolution/void data and event.
- Create sanction, approve it, create relationships, resolve infractions, and create events.
- Edit sanction, relationships, and events.
- Revoke sanction and create event.
- Activate festival, create status event, and create sanction associations.
- Count festival, possibly expire sanction, and create events.

Concurrency safeguards:

- Sanction approval rechecks or locks selected infractions.
- **sanction_infractions.infractionId** uniqueness is the final protection against double association.
- **sanction_festivals** uses composite uniqueness for idempotency.
- Expiration processes may run repeatedly without producing duplicate events.

---

## 17. Revalidation and UI Consistency

Mutations specifically revalidate:

- **/dashboard/infractions**
- The affected administrative detail.
- **/dashboard/festivals/[festivalId]/participants**, when applicable.
- **/profiles/[profileId]/infractions**
- Portal and reservation entry points when eligibility changes.

The implementation does not rely on a generic revalidation of **/dashboard/festivals** to update nested routes.

---

## 18. Data Migration

### 18.1 Preflight

Before applying new restrictions:

- Count existing infractions and sanctions.
- Detect infractions with several existing sanctions.
- Detect sanctions without a valid infraction.
- Detect sanctions whose **userId** differs from their infraction's user.
- Review existing sanction duration values.
- Detect prior-notice records without a timestamp.
- Identify festivals or types whose cascade deletion could remove history.

### 18.2 Gradual Migration

1. Create new enums, columns, and tables in a backward-compatible form.
2. Backfill **handled** into **infraction_status**.
3. Create initial migration events where useful.
4. Create one **sanction_infractions** relationship from every existing **sanctions.infractionId**.
5. Manually review infractions with several sanctions before adding **UNIQUE(infractionId)**.
6. Map **active = true** to **active** and manually review inactive sanctions to distinguish expired from revoked.
7. Use legacy **createdAt** as **approvedAt** when no better evidence exists and leave **approvedByUserId = null**.
8. Review legacy **reservation_delay** sanctions because the old duration field does not distinguish validity from delay.
9. Change destructive foreign keys to **restrict** or an equivalent history-preserving strategy.
10. Add constraints and indexes after data cleanup.
11. Remove **infractions.handled**, **sanctions.active**, and **sanctions.infractionId** after the new code is active and verified.

No prior-notice date will be invented for legacy records. The interface displays “date not recorded.”

### 18.3 Existing Festivals

- Currently active festivals do not qualify retroactively for new sanctions.
- Future transitions to **active** are recorded after deployment of the new central service.
- Historical activation data is loaded only from a reliable source and is not inferred from current status alone.

---

## 19. Implementation Plan

### Phase 1 — Integrity, Security, and Auditability

- New lifecycle states and audit tables.
- Dedicated Zod DTOs and shared administrator authorization.
- Festival participation validation.
- Idempotency and duplicate warnings.
- Prior-notice correction.
- History-preserving deletion policy.
- Initial indexes.

### Phase 2 — Global Infraction Administration

- **/dashboard/infractions** route.
- Server-side paginated query and filters.
- Global or festival registration.
- Detail, editing, review, resolution, and voiding.
- Notes and evidence.
- Festival participant-table context correction.
- Desktop and mobile navigation.

### Phase 3 — Sanction Management

- One sanction to several infractions relationship.
- Multi-select registration.
- Manual approval in the same flow.
- Automatic resolution of included infractions.
- Editing, extension, and revocation.
- Brand scope and validity separated from reservation delay.

### Phase 4 — Festival Qualification

- Central festival status history.
- Recorded transitions to **active**.
- Idempotent association of sanctions with future festivals.
- Counting by final date and expiration.
- Recurring reconciliation.

### Phase 5 — Reservation Enforcement

- Central eligibility service.
- Page gate.
- Validation in hold creation and reservation confirmation.
- Exact reservation eligibility messaging.
- Precedence for simultaneous bans and delays.

### Phase 6 — Transparency and Notifications

- Expanded participant history.
- Active and historical sanctions without visual duplication.
- Lifecycle notifications.
- Remaining-festival and reservation-access information.

### Phase 7 — Migration, Verification, and Deployment

- Legacy-data audit.
- Backfill and final constraints.
- Automated tests.
- Load testing for paginated queries.
- Gradual activation and monitoring.

---

## 20. Testing Strategy

### 20.1 Unit Tests

- Zod validation for registration and editing.
- Lifecycle transitions.
- **endsAt** calculations.
- **reservationEligibleAt** calculations.
- Brand-scope matching.
- Duplicate detection.
- Combination of simultaneous applicable sanctions.

### 20.2 Database Integration Tests

- Consistent pagination, filtering, and counts.
- Idempotency uniqueness.
- One infraction cannot link to two sanctions.
- A sanction cannot remain without infractions.
- Users cannot be mixed within a sanction.
- Sanction approval resolves infractions transactionally.
- Festival activation creates correct associations without duplicates.
- A festival active before approval does not qualify.
- **published** does not qualify.
- Expiration after a configured number of festivals.
- Brand changes do not alter past associations.

### 20.3 Security Tests

- A normal user cannot open the global page.
- A normal user cannot call administrative actions directly.
- Both administrative roles can operate.
- Manipulated or missing IDs are rejected.
- A festival cannot be assigned without participant participation.
- A participant cannot reserve through direct server actions during a ban or delay.

### 20.4 End-to-End Tests

- Register a global infraction.
- Register an infraction from a festival.
- Edit and resolve without a sanction.
- Select several infractions and approve one sanction.
- Activate a festival with a matching brand.
- Observe reservation blocking and the eligibility time.
- Complete the delay and reserve successfully.
- Complete the configured number of festivals and expire the sanction.
- Revoke a sanction and restore eligibility.
- View administrative and participant history.

### 20.5 Performance Tests

- Validate queries with representative volume.
- Run **EXPLAIN ANALYZE** for frequent filter combinations.
- Confirm that count and page queries use appropriate indexes.
- Avoid loading complete user catalogs in selectors.
- Test deep pagination and combined filters.

---

## 21. Global Acceptance Criteria

- Only **admin** and **festival_admin** can access and execute administrative operations.
- Every material mutation records actor, time, and change.
- No infraction or sanction is physically deleted through the interface.
- An infraction may be global or associated with a festival.
- A sanction includes one or several infractions from the same user.
- No infraction may belong to two sanctions.
- Sanction approval automatically resolves included pending or under-review infractions.
- Global-page filtering and pagination occur on the server.
- A festival qualifies only by changing to **active** after approval and matching the sanction scope.
- A festival already active or only **published** does not qualify.
- Reservation delays use **reservationsStartDate** and are enforced in server actions.
- Festival-based sanctions expire after the configured number of festivals ends.
- Participants see clear information without access to internal notes.
- Technical retries do not create duplicates.
- Semantic matches generate warnings while allowing legitimate incidents.
- Migrations preserve and verify existing data.

---

## 22. Out of Scope for the First Implementation

- Participant appeals.
- Mandatory approval by a second administrator.
- Sanctions created or approved automatically from severity.
- Different permissions for **admin** and **festival_admin**.
- Retroactively recalculating already counted festivals when editing scope.
- Treating **published** as a qualifying festival status.
- Introducing a new evidence storage provider.

---

## 23. Risks and Mitigations

| Risk                                                 | Mitigation                                                                    |
| ---------------------------------------------------- | ----------------------------------------------------------------------------- |
| Legacy data has several sanctions for one infraction | Run preflight checks and manually review before adding the unique constraint. |
| History is lost through cascade deletion             | Change foreign keys to restrict and use void/revoke workflows.                |
| Concurrent double association                        | Use a transaction, row checks, and uniqueness on infractionId.                |
| Festival activation history is unreliable            | Centralize status mutations and create festival_status_events.                |
| Recurring jobs duplicate expiration work             | Make operations idempotent and events uniquely guarded.                       |
| Participants bypass restrictions with direct actions | Call the central service from every reservation mutation.                     |
| Global queries are slow                              | Use SQL pagination, indexes, remote selectors, and EXPLAIN review.            |
| Brand scope edits change historical outcomes         | Keep past associations and apply scope changes only going forward.            |
| Validity and reservation delay are confused          | Use separate fields with type-specific validation.                            |

---

## 24. Expected Outcome

After completion, Glitter will have a complete, traceable, and scalable disciplinary system. Administrators will manage incidents from a global view, support one sanction with several infractions, control its scope and validity, and understand which festivals applied it. Participants will receive clear information, and reservation restrictions will be enforced consistently in both the interface and the server.
