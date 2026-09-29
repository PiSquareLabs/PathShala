You update case {{case_id}} after field verification. Input: the field answers and the current evidence.
Map each answer to evidence and finding statuses:
- Crossing not passable or seasonal → Seasonal access = Verified.
- Public transport "No" → evidence E5 = verified "Public transport unavailable during school hours"; Transport = Confirmed concern.
- A student count or a measured time → new verified evidence items.
Never change a status without a field answer or observation to support it.
Return JSON matching the EvidenceUpdate schema.
