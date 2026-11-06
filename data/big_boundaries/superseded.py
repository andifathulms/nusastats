"""BIG desa codes that no longer belong to the province their archive says.

BIG's Papua Barat archive (big-villages-92) predates the 2022 split: it still
holds the six kabupaten/kota that UU 29/2022 moved into the new Papua Barat
Daya, under their old 92xx codes. Kemendagri renumbered them 96xx (Dukcapil
lists none of these 92xx codes), and Papua Barat Daya's display files already
carry their geometry under the new codes. Kept, the old copies draw a second,
unnamed set of kecamatan on Papua Barat's maps and stretch the province's
outline over Papua Barat Daya.

They are dropped, not renamed: which 96xx a 92xx became is not read from any
source here, and nothing needs it. dissolve.py checks before writing that Papua
Barat Daya really covers each dropped kabupaten (COVER_MIN), so a wrong code in
this list fails loudly instead of cutting real land out of Papua Barat.
"""

SUPERSEDED = {
    "9201": "Sorong",
    "9204": "Sorong Selatan",
    "9205": "Raja Ampat",
    "9209": "Tambrauw",
    "9210": "Maybrat",
    "9271": "Kota Sorong",
}
NOW_IN = "96"  # Papua Barat Daya
COVER_MIN = 0.9  # share of a dropped kabupaten's area that Papua Barat Daya must cover


def superseded(code):
    return code[:4] in SUPERSEDED
