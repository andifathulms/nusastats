"""Read numeric indicator values out of a region's raw `attributes` record.

Most fields are already numeric in the ArcGIS response. Two (`luas_wilayah`,
`kepadatan_penduduk`) arrive as locale-formatted strings, so parsing lives
here rather than mutating the stored raw record at ingest time.
"""

import re


def to_number(raw):
    """Best-effort parse of an ArcGIS attribute value to float, or None.

    Handles plain numbers and Indonesian-formatted strings where "." is the
    thousands separator and "," the decimal separator (e.g. "1.234,56"), as
    well as the plain "1234.56" form. Anything unparseable -> None (so it is
    simply excluded from rankings rather than crashing).
    """
    if raw is None:
        return None
    if isinstance(raw, bool):
        return None
    if isinstance(raw, (int, float)):
        return float(raw)
    s = str(raw).strip()
    if not s:
        return None
    # Keep only digits, separators and sign.
    s = re.sub(r"[^0-9,.\-]", "", s)
    if not s or s in {"-", ".", ","}:
        return None
    if "," in s and "." in s:
        # Indonesian: "." thousands, "," decimal.
        s = s.replace(".", "").replace(",", ".")
    elif "," in s:
        # Only a comma -> decimal comma.
        s = s.replace(",", ".")
    # Only "." (or none): treat "." as a decimal point as-is.
    try:
        return float(s)
    except ValueError:
        return None


def region_value(attributes, field):
    """The numeric value of `field` for a region, or None if absent/unparseable."""
    return to_number((attributes or {}).get(field))
