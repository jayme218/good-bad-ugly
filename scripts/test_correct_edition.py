import copy
import datetime as dt
import hashlib
import json
from pathlib import Path
import tempfile
import unittest

import correct_edition as correction

TODAY = dt.date(2026, 10, 31)


def edition():
    return {
        'date': '2026-10-31', 'timezone': 'America/Chicago', 'revision': 0,
        'reviewStatus': 'automated',
        'items': [{'type': kind, 'headline': 'Supported news headline',
                   'summaries': ['A complete supported source sentence.'] * 3,
                   'editorNote': 'The source attributes these reported findings.',
                   'source': {'name': 'Agency', 'url': 'https://example.com/report', 'publishedAt': '2026-10-29'}}
                  for kind in ('good', 'bad', 'ugly')],
    }


def setup_payload():
    original = edition()
    raw = (json.dumps(original, ensure_ascii=False, indent=2) + '\n').encode()
    changed = copy.deepcopy(original)
    changed['revision'] = 1
    changed['items'][0]['headline'] = 'Owner corrected this headline'
    return raw, {'version': 1, 'base': {'date': original['date'], 'revision': 0,
                                       'sha256': hashlib.sha256(raw).hexdigest()}, 'edition': changed}


class CorrectionTests(unittest.TestCase):
    def test_valid_correction_and_explicit_review_status(self):
        raw, payload = setup_payload()
        result = correction.validate_correction(payload, raw, TODAY)
        self.assertEqual(result['revision'], 1)
        self.assertEqual(result['reviewStatus'], 'automated')
        payload['edition']['reviewStatus'] = 'reviewed'
        self.assertEqual(correction.validate_correction(payload, raw, TODAY)['reviewStatus'], 'reviewed')

    def test_owner_is_required(self):
        correction.authorize_owner('jayme218', 'jayme218', 'refs/heads/main', 'true')
        for values in [('collaborator', 'jayme218', 'refs/heads/main', 'true'),
                       ('', 'jayme218', 'refs/heads/main', 'true'),
                       ('jayme218', 'jayme218', 'refs/heads/feature', 'true'),
                       ('jayme218', 'jayme218', 'refs/heads/main', 'false')]:
            with self.subTest(values=values), self.assertRaises(correction.CorrectionError):
                correction.authorize_owner(*values)

    def test_nonowner_cannot_rerun_an_owner_run(self):
        with self.assertRaises(correction.CorrectionError):
            correction.authorize_owner('jayme218', 'jayme218', 'refs/heads/main', 'true', 'collaborator')

    def test_stale_hash_and_base_metadata_are_rejected(self):
        raw, payload = setup_payload()
        for key, value in [('sha256', '0' * 64), ('revision', 1), ('date', '2026-10-30')]:
            changed = copy.deepcopy(payload); changed['base'][key] = value
            with self.subTest(key=key), self.assertRaises(correction.CorrectionError):
                correction.validate_correction(changed, raw, TODAY)
        with self.assertRaises(correction.CorrectionError):
            correction.validate_correction(payload, raw + b' ', TODAY)

    def test_new_day_edition_cannot_be_overwritten(self):
        raw, payload = setup_payload()
        current = edition(); current['date'] = '2026-11-01'
        new_raw = json.dumps(current).encode()
        with self.assertRaises(correction.CorrectionError):
            correction.validate_correction(payload, new_raw, dt.date(2026, 11, 1))

    def test_date_timezone_revision_constraints(self):
        raw, payload = setup_payload()
        for key, value in [('date', '2026-10-30'), ('date', '2026-02-30'),
                           ('timezone', 'UTC'), ('revision', 0), ('revision', 2), ('revision', True),
                           ('revision', 9007199254740992), ('reviewStatus', 'verified')]:
            changed = copy.deepcopy(payload); changed['edition'][key] = value
            with self.subTest(key=key, value=value), self.assertRaises(correction.CorrectionError):
                correction.validate_correction(changed, raw, TODAY)
        with self.assertRaises(correction.CorrectionError):
            correction.validate_correction(payload, raw, dt.date(2026, 10, 30))

    def test_noop_rejected_but_review_only_correction_allowed(self):
        raw, payload = setup_payload()
        payload['edition'] = edition(); payload['edition']['revision'] = 1
        with self.assertRaises(correction.CorrectionError): correction.validate_correction(payload, raw, TODAY)
        payload['edition']['reviewStatus'] = 'reviewed'
        self.assertEqual(correction.validate_correction(payload, raw, TODAY)['reviewStatus'], 'reviewed')

    def test_invalid_fields_and_source_links(self):
        raw, payload = setup_payload()
        mutations = [lambda i: i.update(headline=' '), lambda i: i.update(headline='x' * 31),
                     lambda i: i.update(summaries=['one', 'two']), lambda i: i.update(summaries=[' ', 'two', 'three']),
                     lambda i: i.update(editorNote='\n'), lambda i: i.pop('source'),
                     lambda i: i['source'].update(name=' '), lambda i: i['source'].update(url='http://example.com/a'),
                     lambda i: i['source'].update(url='https://user@example.com/a'),
                     lambda i: i['source'].update(url='https://@example.com/a'),
                     lambda i: i['source'].update(url='https://example.com/a b'),
                     lambda i: i['source'].update(publishedAt='2026-11-01'),
                     lambda i: i['source'].update(publishedAt='2026-02-30')]
        for mutate in mutations:
            changed = copy.deepcopy(payload); mutate(changed['edition']['items'][0])
            with self.subTest(mutate=mutate), self.assertRaises(correction.CorrectionError):
                correction.validate_correction(changed, raw, TODAY)

    def test_three_ordered_categories_only(self):
        raw, payload = setup_payload()
        for items in [payload['edition']['items'][:2], list(reversed(payload['edition']['items']))]:
            changed = copy.deepcopy(payload); changed['edition']['items'] = items
            with self.assertRaises(correction.CorrectionError): correction.validate_correction(changed, raw, TODAY)

    def test_utf16_headline_length_and_unicode_preserved(self):
        raw, payload = setup_payload()
        payload['edition']['items'][0]['headline'] = '😀' * 15
        result = correction.validate_correction(payload, raw, TODAY)
        self.assertEqual(result['items'][0]['headline'], '😀' * 15)
        payload['edition']['items'][0]['headline'] += '😀'
        with self.assertRaises(correction.CorrectionError): correction.validate_correction(payload, raw, TODAY)

    def test_envelope_size_json_shapes_and_duplicate_keys(self):
        raw, payload = setup_payload()
        self.assertEqual(correction.parse_payload(json.dumps(payload))['version'], 1)
        for text in ['{bad', '[]', '{"version":1,"version":1}', ' ' * 65537]:
            with self.subTest(text=text[:30]), self.assertRaises(correction.CorrectionError): correction.parse_payload(text)
        for value in [None, [], {'version': True}, {**payload, 'extra': 'field'}]:
            with self.assertRaises(correction.CorrectionError): correction.validate_correction(value, raw, TODAY)

    def test_only_current_edition_file_is_written(self):
        raw, payload = setup_payload()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); target = root / 'src/data/today.json'; target.parent.mkdir(parents=True)
            target.write_bytes(raw)
            audit = root / 'scripts/data/editorial-record.json'; audit.parent.mkdir(parents=True)
            audit.write_text('{"original":"audit"}')
            correction.apply_correction(root, json.dumps(payload), TODAY)
            self.assertEqual(json.loads(target.read_text())['revision'], 1)
            self.assertEqual(audit.read_text(), '{"original":"audit"}')
            self.assertEqual(set(p.name for p in target.parent.iterdir()), {'today.json'})
            with self.assertRaises(correction.CorrectionError): correction.apply_correction(root, json.dumps(payload), TODAY)


if __name__ == '__main__': unittest.main()
