"""uv run python -m terrain.reclassify [--check]

Re-apply config/terrain_rules.yaml to every computed area's stored metrics,
without recomputing rasters. The class depends only on `metrics_pct`, so this
is the same deterministic rule over the same inputs; it updates terrain_class,
terrain_class_label, terrain_class_reason and classification.rules_sha256, and
writes a changes log. Stored metrics are rounded to 2 decimals, so an area
within 0.005 point of a threshold could classify differently from a full
recompute; such areas are listed (and the batch runner will treat every area
as up to date, since the rules hash now matches).
"""
import argparse
import json
import sys

from common import manifest
from common.paths import CACHE, PUBLIC_PETA

from . import rules

ap = argparse.ArgumentParser()
ap.add_argument("--check", action="store_true", help="report changes without writing")
a = ap.parse_args()

cfg, sha = rules.load()
thresholds = [(c["metric"], c["value"]) for r in cfg["rules"] for mode in ("any", "all") for c in r.get(mode, [])]
changes, near, n = [], [], 0
for d in sorted(p for p in PUBLIC_PETA.iterdir() if p.is_dir()):
    f = d / "terrain.json"
    if not f.exists():
        continue
    t = json.loads(f.read_text())
    n += 1
    m = t["metrics_pct"]
    cls, label, reason = rules.classify(m, cfg)
    for metric, value in sorted(set(thresholds)):
        if abs(m[metric] - value) < 0.005 + 1e-9:
            near.append((d.name, metric, m[metric], value))
    if cls != t["terrain_class"]:
        changes.append({"kode": d.name, "name": t["name"], "from": t["terrain_class_label"], "to": label, "reason": reason})
    if not a.check:
        t["terrain_class"], t["terrain_class_label"], t["terrain_class_reason"] = cls, label, reason
        t["classification"]["rules_sha256"] = sha
        t["classification"]["reclassified_at"] = manifest.now_iso()
        f.write_text(json.dumps(t, indent=2, ensure_ascii=False) + "\n")

summary = {}
for c in changes:
    summary[f"{c['from']} -> {c['to']}"] = summary.get(f"{c['from']} -> {c['to']}", 0) + 1
print(json.dumps({"areas": n, "changed": len(changes), "by_transition": summary, "near_threshold": near}, ensure_ascii=False, indent=1))
if not a.check:
    log = CACHE / "logs" / f"reclassify-{manifest.now_iso().replace(':', '')}.json"
    log.parent.mkdir(parents=True, exist_ok=True)
    log.write_text(json.dumps({"rules_sha256": sha, "changes": changes, "near_threshold": near}, ensure_ascii=False, indent=1))
    sys.stderr.write(f"reclassify: wrote {n} areas; changes log {log}\n")
