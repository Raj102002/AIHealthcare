"""Non-blocking sanity check for --subject-id: warns, never refuses.

This is a heuristic check for an accidental mistake (someone typing a
real name/email/DOB/MRN where an opaque ID was expected), NOT a PII
scrubber -- it is trivially bypassed by anyone who wants to, and a
content-based hard block would have real false positives (legitimate
opaque IDs that happen to look name-like) and false negatives (no
reliable way to detect "this is a real name" from a string), while
falsely implying this tool "catches PII," which it structurally cannot.
"""
import re
from typing import List

_EMAIL_RE = re.compile(r"[^@\s]+@[^@\s]+")
_DATE_RE = re.compile(r"\d{4}-\d{2}-\d{2}|\d{1,2}/\d{1,2}/\d{2,4}")
_LONG_DIGIT_RUN_RE = re.compile(r"\d{6,}")
_CAPITALIZED_WORD_RE = re.compile(r"\b[A-Z][a-z]+\b")


def check_subject_id(subject_id: str) -> List[str]:
    warnings: List[str] = []

    if _EMAIL_RE.search(subject_id):
        warnings.append("subject_id looks like it might be an email address -- use an opaque identifier instead.")

    if _DATE_RE.search(subject_id):
        warnings.append("subject_id looks like it might contain a date (e.g. a date of birth) -- use an opaque identifier instead.")

    if _LONG_DIGIT_RUN_RE.search(subject_id):
        warnings.append("subject_id contains a long digit run -- check it isn't a real identifier like an MRN or SSN.")

    if len(_CAPITALIZED_WORD_RE.findall(subject_id)) >= 2 and " " in subject_id.strip():
        warnings.append("subject_id looks like it might contain a real name (multiple capitalized words) -- use an opaque identifier instead.")

    return warnings
