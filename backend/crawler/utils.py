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
