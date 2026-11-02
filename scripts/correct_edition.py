#!/usr/bin/env python3
"""Validate an owner-prepared correction without trusting browser validation."""
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import tempfile
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
MAX_BYTES = 65_536
MAX_REVISION = 9_007_199_254_740_991
TYPES = ('good', 'bad', 'ugly')


class CorrectionError(ValueError):
    """An actionable failure safe to display without echoing submitted content."""


def authorize_owner(actor, owner, ref, enabled, triggering_actor=None):
    trigger = actor if triggering_actor is None else triggering_actor
    if not owner or actor.casefold() != owner.casefold() or trigger.casefold() != owner.casefold():
        raise CorrectionError('Only the repository owner may publish corrections.')
    if ref != 'refs/heads/main':
        raise CorrectionError('Run the correction publisher from main.')
    if enabled != 'true':
        raise CorrectionError('Publishing is disabled; no correction was written.')


def _object_pairs(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise CorrectionError('The correction contains duplicate JSON fields.')
        result[key] = value
    return result


def parse_payload(text):
    if not isinstance(text, str) or len(text.encode('utf-8')) > MAX_BYTES:
        raise CorrectionError('The correction must be at most 64 KiB.')
    try:
        result = json.loads(text, object_pairs_hook=_object_pairs)
    except (ValueError, RecursionError) as error:
        raise CorrectionError('Paste the complete correction copied from the editor.') from error
    if not isinstance(result, dict):
        raise CorrectionError('Paste the complete correction copied from the editor.')
    return result


def _date(value):
    if not isinstance(value, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', value):
        raise CorrectionError('Dates must use YYYY-MM-DD.')
    try:
        return dt.date.fromisoformat(value)
    except ValueError as error:
        raise CorrectionError('A correction contains an invalid calendar date.') from error


def _text(value, label):
    if not isinstance(value, str) or not value.strip():
        raise CorrectionError(f'{label} must not be blank.')


def _revision(value):
    return type(value) is int and 0 <= value <= MAX_REVISION


def _keys(value, required, optional=()):
    if not isinstance(value, dict) or not set(required).issubset(value) or set(value) - set(required) - set(optional):
        raise CorrectionError('The correction has an unsupported structure; copy it again from the editor.')


def _validate_edition(edition, today):
    _keys(edition, ('date', 'timezone', 'revision', 'items'), ('reviewStatus',))
    day = _date(edition['date'])
    if day > today:
        raise CorrectionError('A future edition cannot be published as a correction.')
    if edition['timezone'] != 'America/Chicago' or not _revision(edition['revision']):
        raise CorrectionError('The edition timezone or revision is invalid.')
    if 'reviewStatus' in edition and edition['reviewStatus'] not in ('automated', 'reviewed'):
        raise CorrectionError('The review status must be automated or reviewed.')
    items = edition['items']
    if not isinstance(items, list) or len(items) != 3:
        raise CorrectionError('Exactly three stories are required.')
    for kind, item in zip(TYPES, items):
        _keys(item, ('type', 'headline', 'summaries', 'editorNote', 'source'))
        if item['type'] != kind:
            raise CorrectionError('Stories must contain Good, Bad and Ugly in order.')
        _text(item['headline'], 'Each headline')
        try:
            length = len(item['headline'].encode('utf-16-le')) // 2
        except UnicodeEncodeError as error:
            raise CorrectionError('A headline contains unsupported text.') from error
        if length > 30:
            raise CorrectionError('Headlines must be at most 30 characters.')
        if not isinstance(item['summaries'], list) or len(item['summaries']) != 3:
            raise CorrectionError('Each story needs exactly three summaries.')
        for summary in item['summaries']:
            _text(summary, 'Each summary')
        _text(item['editorNote'], 'Each editor note')
        source = item['source']
        _keys(source, ('name', 'url'), ('publishedAt',))
        _text(source['name'], 'Each source name')
        _text(source['url'], 'Each source URL')
        try:
            url = urlsplit(source['url'])
            # Reading port also validates malformed authorities. HTTPS ports are
            # allowed: this is a displayed source link, never a server fetch.
            url.port
            valid = url.scheme == 'https' and bool(url.hostname) and url.username is None and url.password is None and not re.search(r'\s', source['url'])
        except ValueError:
            valid = False
        if not valid:
            raise CorrectionError('Source URLs must be valid HTTPS links without embedded credentials or spaces.')
        if 'publishedAt' in source and _date(source['publishedAt']) > day:
            raise CorrectionError('A source publication date cannot be after the edition date.')


def validate_correction(payload, original, today):
    _keys(payload, ('version', 'base', 'edition'))
    if type(payload['version']) is not int or payload['version'] != 1:
        raise CorrectionError('This correction format is unsupported; reload the editor.')
    base = payload['base']
    _keys(base, ('date', 'revision', 'sha256'))
    digest = base['sha256']
    if not isinstance(digest, str) or not re.fullmatch(r'[a-f0-9]{64}', digest):
        raise CorrectionError('The original edition fingerprint is invalid.')
    if hashlib.sha256(original).hexdigest() != digest:
        raise CorrectionError('The edition changed after editing began. Reload the editor and review the latest edition; nothing was overwritten.')
    try:
        current = json.loads(original)
    except (ValueError, UnicodeError) as error:
        raise CorrectionError('The current edition cannot be read.') from error
    if not isinstance(current, dict) or base['date'] != current.get('date') or not _revision(base['revision']) or base['revision'] != current.get('revision', 0):
        raise CorrectionError('The correction no longer matches the current edition.')
    edition = payload['edition']
    _validate_edition(edition, today)
    if edition['date'] != current.get('date') or edition['timezone'] != current.get('timezone'):
        raise CorrectionError('A correction must preserve the original edition date and timezone.')
    if edition['revision'] != base['revision'] + 1:
        raise CorrectionError('A correction must increase the current revision by exactly one.')
    before = {key: value for key, value in current.items() if key != 'revision'}
    after = {key: value for key, value in edition.items() if key != 'revision'}
    if before == after:
        raise CorrectionError('Nothing has changed. Edit a story or explicitly mark the edition reviewed.')
    return edition


def apply_correction(root, text, today):
    payload = parse_payload(text)
    target = root / 'src/data/today.json'
    original = target.read_bytes()
    edition = validate_correction(payload, original, today)
    if target.read_bytes() != original:
        raise CorrectionError('The edition changed during validation; nothing was overwritten.')
    temporary = None
    try:
        with tempfile.NamedTemporaryFile('w', dir=target.parent, delete=False, encoding='utf-8') as handle:
            temporary = handle.name
            json.dump(edition, handle, ensure_ascii=False, indent=2)
            handle.write('\n')
        os.replace(temporary, target)
    finally:
        if temporary and Path(temporary).exists():
            Path(temporary).unlink()
    return edition


def main():
    try:
        authorize_owner(os.environ.get('GITHUB_ACTOR', ''), os.environ.get('GITHUB_REPOSITORY_OWNER', ''),
                        os.environ.get('GITHUB_REF', ''), os.environ.get('PUBLISHING_ENABLED', ''),
                        os.environ.get('GITHUB_TRIGGERING_ACTOR', os.environ.get('GITHUB_ACTOR', '')))
        today = dt.datetime.now(ZoneInfo('America/Chicago')).date()
        edition = apply_correction(ROOT, os.environ.get('CORRECTION_JSON', ''), today)
    except (CorrectionError, OSError, UnicodeError, TypeError, RecursionError):
        # Do not echo submitted news text, URLs or arbitrary exception values.
        import sys
        error = sys.exc_info()[1]
        reason = str(error) if isinstance(error, CorrectionError) else 'The correction could not be processed; nothing was published.'
        print(json.dumps({'status': 'error', 'reason': reason}))
        return 1
    print(json.dumps({'status': 'corrected', 'date': edition['date'], 'revision': edition['revision']}))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
