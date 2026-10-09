"""Read access to BPS `data` responses already stored in CoverageCheckLog,
so derived work (domain discovery, re-decoding values) can run over real,
hashed responses without calling BPS again.
"""

import re
from collections import defaultdict

from catalog.models import CoverageCheckLog

DATA_URL_RE = re.compile(r"/model/data/domain/0000/var/(\d+)/th/")


def latest_data_log_ids():
    """{bps_variable_id: [log ids]}: for every distinct domain=0000 `data`
    URL, the newest non-error log (a re-crawl of the same URL supersedes the
    older one). Ids are ascending, so decoding them in order lets newer
    responses overwrite older ones."""
    latest = {}
    rows = CoverageCheckLog.objects.filter(url__contains="/model/data/domain/0000/", is_error=False)
    for log_id, url in rows.values_list("id", "url").iterator():
        if latest.get(url, 0) < log_id:
            latest[url] = log_id
    by_var = defaultdict(list)
    for url, log_id in latest.items():
        m = DATA_URL_RE.search(url)
        if m:
            by_var[m.group(1)].append(log_id)
    return {var: sorted(ids) for var, ids in by_var.items()}
