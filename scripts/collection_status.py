"""Public operational metadata, without article text or raw exception details."""
import re


EXCLUSIONS = ('duplicate', 'unavailable', 'unsuitable', 'insufficientEvidence', 'requestLimit', 'noRecentEntries')
REASONS = {'ready', 'already-current', 'insufficient-stories', 'edition-changed', 'collection-error'}
MAX_SAFE_INTEGER = 9_007_199_254_740_991


def positive_integer(value):
    if not isinstance(value, str) or not re.fullmatch(r'[1-9][0-9]{0,15}', value):
        return None
    number = int(value)
    return number if number <= MAX_SAFE_INTEGER else None


def collection_report(result, specs, finished_at, environment):
    run_id = positive_integer(environment.get('GITHUB_RUN_ID'))
    attempt = positive_integer(environment.get('GITHUB_RUN_ATTEMPT'))
    counts = result.get('sourceCandidates', {})
    sources = []
    for spec in specs:
        if not isinstance(spec.get('id'), str) or not isinstance(spec.get('name'), str):
            continue
        exclusions = dict.fromkeys(EXCLUSIONS, 0)
        for diagnostic in result.get('reports', []):
            if diagnostic.get('source') == spec['id'] and diagnostic.get('code') in exclusions:
                exclusions[diagnostic['code']] += 1
        sources.append({'id': spec['id'], 'name': spec['name'], 'candidates': counts.get(spec['id']), 'exclusions': exclusions})
    status = result.get('status')
    outcome = 'prepared' if status in ('published', 'draft') else 'skipped' if status == 'skipped' else 'error'
    reason = result.get('reasonCode', 'collection-error')
    return {
        'version': 1,
        'checkedAt': finished_at.isoformat().replace('+00:00', 'Z'),
        'editionDate': result.get('date') or result.get('edition', {}).get('date'),
        'outcome': outcome,
        'reason': reason if reason in REASONS else 'collection-error',
        'eligible': result.get('eligible'),
        'sources': sources,
        'workflow': {'runId': str(run_id), 'runAttempt': attempt} if run_id and attempt else None,
    }
