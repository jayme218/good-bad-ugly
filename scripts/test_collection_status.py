import datetime as dt
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import daily_news as news
from collection_status import collection_report


NOW = dt.datetime(2026, 11, 10, 14, 5, tzinfo=dt.timezone.utc)
SPECS = [{'id': 'nasa', 'name': 'NASA', 'feeds': ['https://www.nasa.gov/feed/']}]


class CollectionStatusTests(unittest.TestCase):
    def test_report_has_bounded_counts_without_raw_diagnostics(self):
        result = {
            'status': 'skipped', 'reasonCode': 'insufficient-stories', 'date': '2026-11-10',
            'eligible': {'good': 1, 'bad': 0, 'ugly': 0}, 'sourceCandidates': {'nasa': 1},
            'reports': [
                {'source': 'nasa', 'code': 'duplicate', 'reason': 'https://example.test/private?token=secret'},
                {'source': 'nasa', 'code': 'unavailable', 'reason': 'raw exception with credentials'},
                {'source': 'nasa', 'code': 'unsuitable'},
                {'source': 'nasa', 'code': 'insufficientEvidence'},
                {'source': 'nasa', 'code': 'requestLimit'},
                {'source': 'nasa', 'code': 'noRecentEntries'},
                {'source': 'unknown', 'code': 'duplicate'},
            ],
        }
        report = collection_report(result, SPECS, NOW, {'GITHUB_RUN_ID': '1234', 'GITHUB_RUN_ATTEMPT': '2'})
        self.assertEqual(report['version'], 1)
        self.assertEqual(report['checkedAt'], '2026-11-10T14:05:00Z')
        self.assertEqual(report['outcome'], 'skipped')
        self.assertEqual(report['reason'], 'insufficient-stories')
        self.assertEqual(report['eligible'], result['eligible'])
        self.assertEqual(report['sources'][0]['candidates'], 1)
        self.assertEqual(set(report['sources'][0]['exclusions'].values()), {1})
        self.assertEqual(report['workflow'], {'runId': '1234', 'runAttempt': 2})
        serialized = json.dumps(report)
        self.assertNotIn('secret', serialized)
        self.assertNotIn('credentials', serialized)
        self.assertNotIn('unknown', serialized)

    def test_uncollected_sources_are_unknown_not_zero(self):
        report = collection_report({'status': 'skipped', 'reasonCode': 'already-current', 'date': '2026-11-10'}, SPECS, NOW, {})
        self.assertIsNone(report['eligible'])
        self.assertIsNone(report['sources'][0]['candidates'])
        self.assertEqual(report['reason'], 'already-current')
        self.assertIsNone(report['workflow'])

    def test_published_collector_output_only_means_prepared(self):
        result = {'status': 'published', 'reasonCode': 'ready', 'edition': {'date': '2026-11-10'},
                  'eligible': {'good': 2, 'bad': 1, 'ugly': 3}, 'sourceCandidates': {'nasa': 2}}
        report = collection_report(result, SPECS, NOW, {})
        self.assertEqual(report['outcome'], 'prepared')
        self.assertEqual(report['reason'], 'ready')
        self.assertEqual(report['editionDate'], '2026-11-10')

    def test_run_identity_rejects_untrusted_or_imprecise_values(self):
        result = {'status': 'skipped', 'reasonCode': 'already-current', 'date': '2026-11-10'}
        for value in ['', '0', '-1', '1/../../evil', '1?token=secret', '９９', '9007199254740992']:
            with self.subTest(value=value):
                report = collection_report(result, SPECS, NOW, {'GITHUB_RUN_ID': value, 'GITHUB_RUN_ATTEMPT': '1'})
                self.assertIsNone(report['workflow'])
        for value in ['0', '-1', 'NaN', '9007199254740992']:
            with self.subTest(value=value):
                report = collection_report(result, SPECS, NOW, {'GITHUB_RUN_ID': '123', 'GITHUB_RUN_ATTEMPT': value})
                self.assertIsNone(report['workflow'])

    def setup_root(self, directory, current_date='2026-11-09'):
        root = Path(directory)
        (root / 'scripts/data').mkdir(parents=True)
        (root / 'scripts/news_sources.json').write_text(json.dumps(SPECS))
        target = root / 'src/data/today.json'
        target.parent.mkdir(parents=True)
        target.write_text(json.dumps({'date': current_date, 'revision': 4, 'reviewStatus': 'reviewed', 'items': []}))
        (root / 'scripts/data/editorial-record.json').write_text('{"owner":"kept"}')
        (root / 'scripts/data/recent-articles.json').write_text('[]')
        return root

    def test_shortage_changes_only_status_and_preserves_owner_publication(self):
        with tempfile.TemporaryDirectory() as directory:
            root = self.setup_root(directory)
            before = {path.relative_to(root): path.read_bytes() for path in root.rglob('*') if path.is_file()}
            with patch.object(news, 'collect', return_value=([], [{'source': 'nasa', 'code': 'duplicate', 'reason': 'used'}])):
                result = news.run(root, NOW, write=True)
            self.assertEqual(result['status'], 'skipped')
            for path, original in before.items():
                self.assertEqual((root / path).read_bytes(), original)
            report = json.loads((root / 'public/collection-status.json').read_text())
            self.assertEqual(report['reason'], 'insufficient-stories')
            self.assertEqual(report['sources'][0]['exclusions']['duplicate'], 1)

    def test_dry_run_does_not_create_or_change_status(self):
        with tempfile.TemporaryDirectory() as directory:
            root = self.setup_root(directory)
            with patch.object(news, 'collect', return_value=([], [])):
                news.run(root, NOW, write=False)
            status = root / 'public/collection-status.json'
            self.assertFalse(status.exists())
            status.parent.mkdir()
            status.write_text('{"previous":"report"}')
            with patch.object(news, 'collect', return_value=([], [])):
                news.run(root, NOW, write=False)
            self.assertEqual(status.read_text(), '{"previous":"report"}')

    def test_current_day_report_does_not_claim_sources_were_checked(self):
        with tempfile.TemporaryDirectory() as directory:
            root = self.setup_root(directory, '2026-11-10')
            target = root / 'src/data/today.json'
            original = target.read_bytes()
            with patch.object(news, 'collect', side_effect=AssertionError('must not collect')):
                news.run(root, NOW, write=True)
            report = json.loads((root / 'public/collection-status.json').read_text())
            self.assertEqual(report['reason'], 'already-current')
            self.assertIsNone(report['eligible'])
            self.assertIsNone(report['sources'][0]['candidates'])
            self.assertEqual(target.read_bytes(), original)

    def test_dry_run_output_cannot_target_operational_status(self):
        with tempfile.TemporaryDirectory() as directory:
            root = self.setup_root(directory)
            status = root / 'public/collection-status.json'
            with patch.object(news, 'ROOT', root), patch('sys.argv', ['daily_news.py', '--dry-run', '--output', str(status)]), patch('builtins.print'):
                self.assertEqual(news.main(), 1)
            self.assertFalse(status.exists())

    def test_feed_and_article_failures_have_distinct_sanitized_codes(self):
        spec = {**SPECS[0], 'hosts': ['www.nasa.gov'], 'family': 'science', 'categories': ['good']}
        entry = {'url': 'https://www.nasa.gov/article', 'title': 'NASA discovers worlds', 'published': NOW, 'body': ''}
        with patch.object(news, 'fetch', side_effect=OSError('network secret')):
            _, reports = news.collect([spec], NOW, set())
        self.assertEqual(reports[0]['code'], 'unavailable')
        with patch.object(news, 'fetch', side_effect=[b'feed', b'<main>No recognized article body</main>']), patch.object(news, 'parse_feed', return_value=[entry]):
            _, reports = news.collect([spec], NOW, set())
        self.assertEqual(reports[0]['code'], 'insufficientEvidence')


if __name__ == '__main__':
    unittest.main()
