from common import outlines
from common.paths import big_desa_file


def test_remap_96_from_92():
    src, take, leave_out = outlines._source("96")
    assert src == big_desa_file("92")
    assert take == {"9201": "9601", "9204": "9602", "9205": "9603", "9209": "9604", "9210": "9605",
                    "9271": "9671"}
    assert leave_out == set()


def test_92_leaves_out_moved_regencies():
    src, take, leave_out = outlines._source("92")
    assert src == big_desa_file("92")
    assert take is None
    assert leave_out == {"9201", "9204", "9205", "9209", "9210", "9271"}


def test_other_provinces_untouched():
    src, take, leave_out = outlines._source("91")
    assert (src, take, leave_out) == (big_desa_file("91"), None, set())
