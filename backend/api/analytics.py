"""Pure computation helpers for the analytics endpoints (ranking, growth).
Kept free of Django/DRF so they can be unit-tested directly on plain data.
"""

from statistics import mean, median


def pearson(xs, ys):
    """Pearson correlation coefficient for paired samples, or None if it's
    undefined (fewer than 2 points, or a variable with zero variance)."""
    n = len(xs)
    if n < 2:
        return None
    mx, my = mean(xs), mean(ys)
    cov = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    vx = sum((x - mx) ** 2 for x in xs)
    vy = sum((y - my) ** 2 for y in ys)
    if vx == 0 or vy == 0:
        return None
    return round(cov / (vx**0.5 * vy**0.5), 4)


def distribution(values):
    """Summary spread stats for a list of numeric values."""
    values = [v for v in values if v is not None]
    if not values:
        return {"count": 0, "min": None, "max": None, "mean": None, "median": None}
    return {
        "count": len(values),
        "min": min(values),
        "max": max(values),
        "mean": round(mean(values), 4),
        "median": round(median(values), 4),
    }


def rank_rows(rows, order="desc"):
    """rows: [{'domain_id','domain_name','value'}, ...] -> same rows sorted
    with a 1-based `rank` added. Ties get distinct sequential ranks in the
    sorted order (stable)."""
    ordered = sorted(rows, key=lambda r: r["value"], reverse=(order != "asc"))
    for i, r in enumerate(ordered, start=1):
        r["rank"] = i
    return ordered


def growth_rows(from_by_domain, to_by_domain, order="desc"):
    """Given two {domain_id: (name, value)} maps for an earlier and later
    year, compute per-domain absolute and percent change for domains
    present in both, sorted by percent change."""
    out = []
    for domain_id, (name, to_val) in to_by_domain.items():
        if domain_id not in from_by_domain:
            continue
        from_val = from_by_domain[domain_id][1]
        change = to_val - from_val
        pct = (change / from_val * 100) if from_val else None
        out.append(
            {
                "domain_id": domain_id,
                "domain_name": name,
                "value_from": from_val,
                "value_to": to_val,
                "change": round(change, 4),
                "change_pct": round(pct, 2) if pct is not None else None,
            }
        )
    reverse = order != "asc"
    out.sort(key=lambda r: (r["change_pct"] is not None, r["change_pct"] or 0), reverse=reverse)
    for i, r in enumerate(out, start=1):
        r["rank"] = i
    return out
