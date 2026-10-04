"""Transparent, config-driven terrain classification (spec §5.2)."""
import hashlib
import operator

import yaml

from common.fmt import pct
from common.paths import CONFIG

OPS = {">=": operator.ge, ">": operator.gt, "<=": operator.le, "<": operator.lt}
RULES_FILE = CONFIG / "terrain_rules.yaml"


def load(path=RULES_FILE):
    raw = path.read_bytes()
    return yaml.safe_load(raw), hashlib.sha256(raw).hexdigest()


def classify(metrics: dict, cfg: dict) -> tuple[str, str, str]:
    """-> (class, label, reason). Reason names the matched rule and actual values."""
    labels = cfg["metrics"]
    for rule in cfg["rules"]:
        if rule.get("default"):
            shown = ", ".join(f"{pct(metrics[m])} {labels[m]}"
                              for m in ("share_elev_ge_1000", "share_slope_ge_8", "share_elev_lt_100"))
            return rule["class"], rule["label"], f"{rule['label']}: tidak memenuhi aturan lain ({shown})"
        mode = "any" if "any" in rule else "all"
        conds = rule[mode]
        hits = [c for c in conds if OPS[c["op"]](metrics[c["metric"]], c["value"])]
        if (mode == "any" and hits) or (mode == "all" and len(hits) == len(conds)):
            parts = [f"{pct(metrics[c['metric']])} {labels[c['metric']]}" for c in hits]
            return rule["class"], rule["label"], f"{rule['label']}: " + " dan ".join(parts)
    raise ValueError("terrain_rules.yaml has no default rule")
