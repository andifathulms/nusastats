"""Shared parsing helpers for BPS WebAPI responses.

BPS list endpoints (`domain`, `subjectcategory`, `subject`, `var`, `vervar`,
`th`, ...) wrap their payload as `data: [<pagination meta>, [<row>, ...]]`
for paginated models, but some return `data: [<row>, ...]` directly. This
normalizes both shapes to a plain list of row dicts.
"""


def extract_rows(body):
    if not isinstance(body, dict):
        return []
    data = body.get("data")
    if not isinstance(data, list) or not data:
        return []
    first = data[0]
    if isinstance(first, dict) and "page" in first and len(data) > 1 and isinstance(data[1], list):
        return data[1]
    return data


def extract_pagination(body):
    """Returns (current_page, total_pages) from a paginated list response,
    or (1, 1) if the response isn't paginated. Confirmed live: BPS list
    endpoints default to per_page=10 and silently return only page 1 if
    the caller doesn't loop `page` — a real bug this caught (a variable's
    `th` list was missing its 5 oldest years until pagination was added).
    """
    if not isinstance(body, dict):
        return 1, 1
    data = body.get("data")
    if not isinstance(data, list) or not data:
        return 1, 1
    first = data[0]
    if isinstance(first, dict) and "pages" in first:
        return first.get("page", 1), first.get("pages", 1)
    return 1, 1
