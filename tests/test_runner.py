"""Work ordering: a run that dies partway must leave a balanced sample.

The bank is stored band by band, so both naive orderings fail. A prefix of
the file is all easy puzzles, and iterating model by model leaves the last
model holding nothing when a run is cut short -- which is exactly what an
exhausted account did to the first full run of this eval.
"""

from __future__ import annotations

from collections import Counter

from eval.runner.run import stratified

class TestWorkOrdering:
    @staticmethod
    def bank(per_band: int = 10) -> list[dict]:
        return [
            {"id": f"{band}-{i}", "rating_band": band}
            for band in (1200, 1600, 2000, 2400)
            for i in range(per_band)
        ]

    def test_every_prefix_spans_every_band(self):
        ordered = stratified(self.bank())
        for cut in (4, 12, 20, 40):
            counts = Counter(task["rating_band"] for task in ordered[:cut])
            assert set(counts) == {1200, 1600, 2000, 2400}
            assert max(counts.values()) - min(counts.values()) <= 1

    def test_keeps_every_task_when_not_truncated(self):
        bank = self.bank()
        assert len(stratified(bank)) == len(bank)
        assert {t["id"] for t in stratified(bank)} == {t["id"] for t in bank}

    def test_a_limit_takes_evenly_from_each_band(self):
        counts = Counter(t["rating_band"] for t in stratified(self.bank(), 8))
        assert counts == {1200: 2, 1600: 2, 2000: 2, 2400: 2}

    def test_work_is_task_major_so_models_stay_level(self):
        # Interrupting after any number of requests must leave the models at
        # near-equal coverage, not the last one starved.
        models = ["a", "b", "c"]
        work = [(t, m) for t in stratified(self.bank()) for m in models]
        for cut in (6, 15, 31):
            counts = Counter(m for _, m in work[:cut])
            assert max(counts.values()) - min(counts.values()) <= 1
