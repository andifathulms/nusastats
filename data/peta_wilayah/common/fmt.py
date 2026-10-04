"""Indonesian number formatting for human-readable strings (reason texts)."""


def pct(x: float, nd: int = 1) -> str:
    return f"{x:.{nd}f}".replace(".", ",") + "%"
