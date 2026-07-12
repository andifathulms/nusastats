"""Parse the DJPK `csv_apbd` SpreadsheetML export into structured rows.

The export is Microsoft SpreadsheetML (XML), not CSV despite the endpoint
name. Shape:

    <Workbook><Worksheet><Table>
      <Row><Cell><Data ss:Type="String">Akun</Data></Cell> ... </Row>   # header
      <Row><Cell><Data> Pendapatan Daerah</Data></Cell>
           <Cell><Data ss:Type="Number">5.04E+12</Data></Cell>          # anggaran
           <Cell><Data ss:Type="Number">5.89E+12</Data></Cell>          # realisasi
           <Cell><Data ss:Type="String">116.67</Data></Cell></Row>      # persentase
      ...
    </Table></Worksheet></Workbook>

Notes we handle deliberately:

  - Numbers arrive both plain and in scientific notation ("1.13E+15").
  - The account tree is FLAT in the file: every label carries exactly one
    leading space, so depth is NOT encoded here — hierarchy is supplied
    separately by `djpk.accounts`. We keep the label verbatim (stripped) and
    the row order (`line_index`), which is the real audit-faithful record.
  - Some labels repeat within one report (e.g. "Belanja Pegawai" twice, or
    "Belanja Barang Jasa" + "Belanja Barang dan Jasa") because DJPK emits both
    old- and new-nomenclature account lines. We never dedup — every line is
    kept under its own `line_index`.
"""

import re
import xml.etree.ElementTree as ET

NS = "{urn:schemas-microsoft-com:office:spreadsheet}"


class DjpkParseError(Exception):
    pass


def slugify_akun(label):
    """Deterministic key for an account label: lowercase ASCII words joined by
    underscores. Stable across runs so it can key the `djpk.accounts` catalog
    and be filtered on. Not guaranteed unique within a report (duplicates are
    disambiguated by line_index)."""
    s = label.strip().lower()
    s = re.sub(r"[^a-z0-9]+", "_", s)
    return s.strip("_")


def _to_number(text):
    if text is None:
        return None
    t = text.strip()
    if t == "":
        return None
    try:
        return float(t)
    except ValueError:
        return None


def parse_apbd(raw_bytes):
    """Parse an export into a list of dicts, in file order:

        {line_index, akun, akun_key, anggaran, realisasi, persentase}

    `anggaran`/`realisasi` are floats (or None); `persentase` is a float
    percent (or None). Raises DjpkParseError on malformed XML.
    """
    try:
        root = ET.fromstring(raw_bytes)
    except ET.ParseError as exc:
        raise DjpkParseError(f"malformed SpreadsheetML: {exc}") from exc

    rows = []
    idx = 0
    for row in root.iter(f"{NS}Row"):
        data_cells = [cell.find(f"{NS}Data") for cell in row.findall(f"{NS}Cell")]
        vals = [(d.text if d is not None else None) for d in data_cells]
        if not vals:
            continue
        first = (vals[0] or "").strip()
        # Skip the header row and any blank leading cell.
        if first == "" or first == "Akun":
            continue
        rows.append(
            {
                "line_index": idx,
                "akun": first,
                "akun_key": slugify_akun(first),
                "anggaran": _to_number(vals[1] if len(vals) > 1 else None),
                "realisasi": _to_number(vals[2] if len(vals) > 2 else None),
                "persentase": _to_number(vals[3] if len(vals) > 3 else None),
            }
        )
        idx += 1

    if not rows:
        raise DjpkParseError("no account rows found in export")
    return rows
