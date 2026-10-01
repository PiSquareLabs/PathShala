# School Consolidation Investigation

### User Story

**User:** District/Block Education Officer
**Goal:** Assess whether consolidating two schools is practical, understand the impact on students and communities, identify mitigation measures, and prepare an evidence-backed report.

---

## 1. Case Map — Find a School

The officer opens the application and sees a map of the district.

Schools are displayed as markers.

The officer clicks:

**Government Primary School A**

A side panel opens.

### Nearby schools

| School   | Distance | Students |     Capacity | Merge screening |
| -------- | -------: | -------: | -----------: | --------------: |
| School B |   3.8 km |      143 | 40 available |              82 |
| School C |   6.1 km |       86 | 12 available |              61 |
| School D |   9.4 km |       54 |  5 available |              38 |

The officer selects:

**School A + School B**

The system makes clear that the score is an **initial screening score**, not a merger recommendation.

**[Investigate this consolidation]**

---

# 2. Compare Schools

The application switches to a two-column comparison.

### School A

27 students
4 teachers
4 habitations served

### School B

143 students
8 teachers
40 available seats

The map remains visible between/above the two panels.

The officer can immediately see:

* school locations
* affected habitations
* road connection
* student population
* receiving-school capacity

The officer clicks:

**Continue**

---

# 3. Access & Geography

The system focuses the map on the two schools.

### Travel to School B

**Walking:** 4.6 km · ~55 min
**Road:** 3.8 km · ~39 min

Available transport information is displayed where data exists:

* Public bus
* School transport
* Walking
* Private vehicle

The map highlights the route.

A terrain/access layer shows available information such as:

* elevation/slope
* rivers
* bridges
* difficult road segments
* seasonal access information

If a data point isn't available, the system explicitly says:

**Data unavailable**

rather than inventing it.

---

# 4. Community Feedback

The officer opens:

**Community feedback**

The system retrieves feedback associated with:

* School A
* School B
* affected villages/habitations

The agent classifies the responses into themes.

### Feedback summary

**Transport — 31 responses**

**Seasonal access — 19**

**Safety — 14**

**Facilities — 7**

**Other — 16**

The officer clicks **Transport**.

They see the underlying citizen responses.

For example:

> "There is no regular bus from our village."

> "Children currently walk to the main road."

> "During heavy rain the route becomes difficult."

Every finding can be traced back to the original feedback.

The officer can distinguish:

**Reported by citizens**

from

**Verified by government**

---

# 5. Agent Investigation

The officer clicks:

**Investigate case**

The agent works across the available evidence.

It checks:

* school data
* GIS information
* routes
* field observations
* citizen feedback

The UI shows concise progress:

✓ Analysed affected students
✓ Checked routes
✓ Analysed community feedback
✓ Identified recurring concerns
✓ Found evidence gaps

The agent produces:

## Potential issue detected

### Transport & seasonal access

**Evidence**

* 31 citizen responses mention transport
* 19 mention seasonal access
* 4 habitations are affected
* Field evidence reports a seasonal bridge issue

### Evidence status

**Reported:** Community feedback

**Verified:** Field observation

**Calculated:** GIS travel distance

**Needs verification:** Actual transport availability

---

# 6. Agent Generates Targeted Field Questions

The agent notices that the existing evidence is insufficient.

Instead of giving the officer a generic survey, it creates questions specifically for this case.

### Additional field verification required

**1. Is the bridge passable by school transport during heavy rain?**

Yes / No / Seasonal

**2. How many affected students currently use this route?**

Number

**3. Is public transport available during school arrival/departure times?**

Yes / No / Unknown

**4. What is the approximate travel time during school hours?**

Minutes

**5. Upload supporting evidence**

Photo / GPS / Note

The officer completes the survey and submits it.

---

# 7. Evidence Updated

The case automatically updates.

For example:

### Transport

**Confirmed concern**

### Seasonal access

**Verified**

### Public transport

**Unavailable during school hours**

The new field evidence is now part of the case record.

---

# 8. First Investigation Report

The officer clicks:

**View Investigation Report**

The report combines all evidence.

### Proposed consolidation

**School A → School B**

27 affected students
4 habitations

### Geographic impact

3.8 km road distance
~39 min estimated travel

### Community feedback

31 transport concerns
19 seasonal-access concerns
14 safety concerns

### Field verification

Seasonal bridge access confirmed.

### Agent findings

**Primary issue:** Transport/access

**Secondary issue:** Seasonal road accessibility

### Outstanding information

Vehicle availability
Applicable transport eligibility
Final cost estimate

Every important finding has a source.

The officer can click a finding to inspect its evidence.

---

# 9. Policy Investigation

The agent searches the available government policy corpus.

It finds a potentially relevant transport provision.

### Potential intervention

## School transport support

**Policy source:** Government policy document

**Relevant provision:** Transport/escort support

The system explains:

### Why this policy may be relevant

The proposed consolidation increases travel requirements for affected students, while field verification and community feedback identify transport/access constraints.

The officer can open the original policy source.

The system clearly distinguishes:

**Policy requirement**

from

**Agent interpretation**

---

# 10. Intervention Cost

The system calculates the potential cost using actual structured inputs.

For example:

**Eligible students:** 27

**Required route:** 3.8 km

**Vehicle requirement:** 1

**Applicable rate:** ₹X

### Estimated annual cost

**₹X**

The calculation is transparent.

The LLM does **not** invent the number.

---

# 11. Officer Selects Intervention

The officer selects:

**School transport support**

Other potential interventions may be displayed if supported by available policies.

The officer clicks:

**Generate report**

---

# 12. AI Drafts the Justification

The agent creates a draft based only on the evidence in the case.

### Draft rationale

The proposed consolidation would affect 27 students across four habitations. The receiving school is approximately 3.8 km away by road, with an estimated travel time of 39 minutes. Community feedback identifies transport and seasonal access as recurring concerns, while field verification confirms difficulties at a seasonal bridge.

Based on these documented conditions, transport support may be relevant to mitigate access constraints, subject to applicable eligibility and administrative approval.

### Evidence

* School data
* GIS calculation
* Citizen feedback
* Field verification
* Policy provision

### Estimated cost

₹X/year

### Outstanding verification

3 items

---

# 13. Officer Reviews the Report

The officer can:

**Edit**

**Remove finding**

**Add comment**

**Mark evidence verified**

**Approve draft**

The officer remains responsible for the final report.

The AI never automatically approves the merger or intervention.

---

# 14. Final Submission

The officer clicks:

**Submit Investigation Report**

The final case contains:

### Decision evidence

School comparison
GIS/access analysis
Community feedback
Field verification

### Identified impacts

Transport
Seasonal access
Safety

### Proposed mitigation

School transport support

### Cost

₹X/year

### Evidence gaps

Any remaining unresolved questions

### Status

**Ready for administrative review**

---

# The Core Product Loop

The entire experience can be understood as:

**Map**

→ Where are the schools and students?

**Evidence**

→ What could change?

**Community**

→ What are people experiencing?

**Agent**

→ What problems and evidence gaps exist?

**Field Officer**

→ Verify what we don't know.

**Policy**

→ What government intervention could address the problem?

**Calculation**

→ What would it actually cost?

**AI Report**

→ Why is the intervention justified?

**Officer**

→ Review, edit and submit.

### The agent's role

The agent is essentially an **investigator**:

> **Find evidence → identify problems → find what's missing → ask the right questions → connect evidence to policy → draft the explanation.**

The officer remains the **decision-maker**.
