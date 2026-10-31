#!/usr/bin/env python3
"""Free, conservative extractive publisher. No LLM, secret, or paid service.

Exit 0: draft/published/skipped (inspect JSON status); exit 1: error.
A skipped run leaves the published edition untouched. --dry-run never writes
publication files; --output writes only the requested diagnostic JSON.
"""
import argparse
import datetime as dt
import email.utils
from html import unescape
from html.parser import HTMLParser
import itertools
import json
import os
from pathlib import Path
import re
import tempfile
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from zoneinfo import ZoneInfo

UTC = dt.timezone.utc
MAX_BYTES = 2_000_000
MAX_ARTICLES_PER_SOURCE = 6
TIMEOUT = 15
TYPES = ('good', 'bad', 'ugly')
ROOT = Path(__file__).resolve().parents[1]
CONTENT = '{http://purl.org/rss/1.0/modules/content/}encoded'
ATOM = '{http://www.w3.org/2005/Atom}'


def chicago_date(now):
    return now.astimezone(ZoneInfo('America/Chicago')).date().isoformat()


def allowed_url(url, spec):
    try:
        parts = urllib.parse.urlsplit(url)
        return (parts.scheme == 'https' and parts.hostname in spec['hosts']
                and not parts.username and not parts.password and parts.port in (None, 443))
    except ValueError:
        return False


class SafeRedirect(urllib.request.HTTPRedirectHandler):
    def __init__(self, spec):
        self.spec = spec
        self.count = 0

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        self.count += 1
        if self.count > 4 or not allowed_url(newurl, self.spec):
            raise ValueError('redirect outside source allowlist or redirect limit')
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def fetch(url, spec):
    if not allowed_url(url, spec):
        raise ValueError('URL outside source allowlist')
    request = urllib.request.Request(url, headers={'User-Agent':'GoodBadUgly/1.0 (public news feed reader)', 'Accept':'application/rss+xml, application/atom+xml, text/html, application/xml'})
    with urllib.request.build_opener(SafeRedirect(spec)).open(request, timeout=TIMEOUT) as response:
        if not allowed_url(response.geturl(), spec):
            raise ValueError('final URL outside source allowlist')
        data = response.read(MAX_BYTES + 1)
        if len(data) > MAX_BYTES:
            raise ValueError('response exceeds size limit')
        return data


def parse_date(text):
    if not text:
        return None
    try:
        value = email.utils.parsedate_to_datetime(text)
    except (TypeError, ValueError):
        try:
            value = dt.datetime.fromisoformat(text.replace('Z','+00:00'))
        except (TypeError, ValueError):
            return None
    return value.astimezone(UTC) if value.tzinfo else None


def plain(text):
    return re.sub(r'\s+', ' ', unescape(text)).strip()


def parse_feed(data, spec, now):
    if b'<!DOCTYPE' in data.upper() or b'<!ENTITY' in data.upper():
        raise ValueError('DTD and entity declarations are unsupported')
    try:
        root = ET.fromstring(data)
    except ET.ParseError as error:
        raise ValueError('source did not return usable XML') from error
    if root.tag not in ('rss', ATOM+'feed', '{http://www.w3.org/1999/02/22-rdf-syntax-ns#}RDF'):
        raise ValueError('source did not return an RSS or Atom feed')
    atom = root.tag == ATOM+'feed'
    entries = root.findall(ATOM+'entry') if atom else root.findall('.//item')
    result = []
    for entry in entries[:50]:
        title = plain(entry.findtext(ATOM+'title' if atom else 'title',''))
        if atom:
            links = [e for e in entry.findall(ATOM+'link') if e.get('rel','alternate') == 'alternate']
            url = links[0].get('href','') if links else ''
            published = parse_date(entry.findtext(ATOM+'published'))
            body = entry.findtext(ATOM+'content') or entry.findtext(ATOM+'summary','')
        else:
            url = (entry.findtext('link') or '').strip()
            published = parse_date(entry.findtext('pubDate'))
            body = entry.findtext(CONTENT) or entry.findtext('description','')
        if not title or not allowed_url(url,spec) or not published:
            continue
        if published > now or now - published > dt.timedelta(days=7):
            continue
        result.append({'title':title, 'url':urllib.parse.urldefrag(url)[0], 'published':published, 'body':body})
    return result


class Paragraphs(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.current = []
        self.in_p = False
        self.in_pre = False
        self.pre_current = []
        self.skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in ('script','style','nav','footer','header'):
            self.skip += 1
        if tag == 'pre' and not self.skip:
            self.in_pre = True
            self.pre_current = []
        if tag == 'br' and self.in_pre and not self.skip:
            self.pre_current.append('\n')
        if tag == 'p' and not self.skip:
            self.current = []
            self.in_p = True

    def handle_endtag(self, tag):
        if tag == 'pre' and self.in_pre:
            # BLS releases wrap lines inside a paragraph and separate header,
            # contact details and release paragraphs with a blank line.
            self.parts.extend(plain(part) for part in re.split(r'\r?\n[ \t]*\r?\n', ''.join(self.pre_current)) if part.strip())
            self.pre_current = []
            self.in_pre = False
        if tag == 'p' and self.in_p:
            self.parts.append(plain(''.join(self.current)))
            self.current = []
            self.in_p = False
        if tag in ('script','style','nav','footer','header') and self.skip:
            self.skip -= 1

    def handle_data(self, data):
        if self.in_pre and not self.skip:
            self.pre_current.append(data)
        elif self.in_p and not self.skip:
            self.current.append(data)


def excerpts(body):
    parser = Paragraphs()
    parser.feed(body)
    paragraphs = parser.parts if parser.parts else [plain(re.sub(r'<[^>]+>', ' ', body))]
    result = []
    for paragraph in paragraphs:
        if re.search(r'copyright|all rights reserved|subscribe|sign up|media contact|technical information:|transmission of material|for more information|\bcookie\b', paragraph, re.I):
            continue
        protected = paragraph
        for token in ('U.S.','U.K.','Dr.','Mr.','Ms.','Inc.','e.g.','i.e.'):
            protected = protected.replace(token,token.replace('.','∯'))
        sentences = re.split(r'(?<=[.!?])\s+(?=[A-Z“"0-9])', protected)
        for sentence in sentences:
            sentence = sentence.replace('∯','.')
            if 45 <= len(sentence) <= 360 and re.search(r'[.!?][”"\']?$',sentence) and sentence not in result:
                result.append(sentence)
            if len(result) == 3:
                return result
    return []


class ArticleBody(HTMLParser):
    """Capture balanced, explicitly marked article containers, not page chrome."""
    VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
            'link', 'meta', 'param', 'source', 'track', 'wbr'}

    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.depth = 0
        self.active = []
        self.completed = []

    def handle_starttag(self, tag, attrs):
        for capture in self.active:
            capture['parts'].append(self.get_starttag_text())
        attributes = dict(attrs)
        classes = set((attributes.get('class') or '').split())
        # Drupal body fields are narrower than their enclosing article. BLS
        # releases mark the release text as bodytext, often containing a pre.
        body = bool(classes & {'field--name-body', 'field-name-body', 'body-content'})
        body = body or attributes.get('id') == 'bodytext'
        if body or tag == 'article':
            self.active.append({'depth': self.depth, 'rank': 0 if body else 1, 'parts': []})
        if tag not in self.VOID:
            self.depth += 1

    def handle_startendtag(self, tag, attrs):
        for capture in self.active:
            capture['parts'].append(self.get_starttag_text())

    def handle_endtag(self, tag):
        if tag in self.VOID:
            return
        self.depth = max(0, self.depth - 1)
        remaining = []
        for capture in self.active:
            if capture['depth'] == self.depth:
                self.completed.append((capture['rank'], ''.join(capture['parts'])))
            else:
                capture['parts'].append(f'</{tag}>')
                remaining.append(capture)
        self.active = remaining

    def handle_data(self, data):
        for capture in self.active:
            capture['parts'].append(data)

    def handle_entityref(self, name):
        self.handle_data(f'&{name};')

    def handle_charref(self, name):
        self.handle_data(f'&#{name};')


def article_body(data):
    parser = ArticleBody()
    parser.feed(data.decode('utf-8', errors='replace'))
    if not parser.completed:
        raise ValueError('source has no recognized article body')
    return min(parser.completed, key=lambda capture: capture[0])[1]


UGLY_TITLE = r'\b(deceiv\w*|deceptive|misleading|fraud\w*|scam\w*|sue[sd]?|charges?|impersonation)\b'


def possible_category(entry, spec):
    # Good is intentionally title-based. Bad and Ugly need the article text;
    # a short feed teaser must not prevent looking for supporting statements.
    return ('good' in spec['categories'] and category(entry, spec) == 'good'
            or 'bad' in spec['categories']
            or 'ugly' in spec['categories'] and re.search(UGLY_TITLE, entry['title'], re.I))


def category(entry, spec):
    title = entry['title'].lower()
    body = plain(re.sub(r'<[^>]+>',' ', entry['body'])).lower()
    if 'good' in spec['categories']:
        if re.search(r'\b(invites media|key events|schedule|image|webinar|podcast|potential|request for information|ice loss|warming|melt\w*|declin\w*|risk\w*|threat\w*|damage|loss|fail\w*|danger\w*|death\w*|fatal|harm\w*|drought|flood\w*|cancel\w*)\b',title):
            return None
        if re.search(r'\b(discover\w*|achiev\w*|success\w*|complet\w*|selects|advanc\w*|improv\w*)\b',title):
            return 'good'
    if 'bad' in spec['categories']:
        if re.search(r'\b(unemployment (?:rate )?(?:rose|increased)|prices (?:rose|increased)|employment (?:fell|declined|decreased)|fatal injuries|job losses|inflation (?:rose|increased))\b',body):
            return 'bad'
    if 'ugly' in spec['categories'] and re.search(UGLY_TITLE,title):
        if re.search(r'\b(alleg\w*|complaint|charged|charges|sue[sd]?|deceiv\w*|deceptive|misleading|fraud)\b',body):
            return 'ugly'
    return None


def shorten(title):
    if len(title) <= 30:
        return title
    words = title[:30].rsplit(' ',1)[0]
    return (words or title[:29])[:29].rstrip(' ,:;') + '…'


def collect(specs, now, used):
    candidates, reports = [], []
    for spec in specs:
        entries = {}
        for feed in spec['feeds']:
            try:
                fresh = parse_feed(fetch(feed,spec),spec,now)
                if not fresh:
                    reports.append({'source':spec['id'],'feed':feed,'reason':'no recent entries with valid publication dates and allowed URLs'})
                for entry in fresh:
                    entries.setdefault(entry['url'],entry)
            except Exception as error:
                reports.append({'source':spec['id'],'feed':feed,'reason':str(error)[:200]})
        ranked = sorted(entries.values(),key=lambda e:(-e['published'].timestamp(),e['url']))
        body_fetches = 0
        for entry in ranked[:30]:
            if entry['url'] in used:
                reports.append({'source':spec['id'],'url':entry['url'],'reason':'recently used'})
                continue
            if not possible_category(entry,spec):
                reports.append({'source':spec['id'],'url':entry['url'],'reason':'no conservative category match'})
                continue
            kind = category(entry,spec)
            passages = excerpts(entry['body'])
            if not kind or not passages:
                if body_fetches >= MAX_ARTICLES_PER_SOURCE:
                    reports.append({'source':spec['id'],'url':entry['url'],'reason':'article request budget exhausted'})
                    continue
                body_fetches += 1
                try:
                    body = article_body(fetch(entry['url'],spec))
                    entry = {**entry, 'body': body}
                    kind = category(entry,spec)
                    passages = excerpts(body)
                except Exception as error:
                    reports.append({'source':spec['id'],'url':entry['url'],'reason':str(error)[:200]})
                    continue
            if not kind:
                reports.append({'source':spec['id'],'url':entry['url'],'reason':'no conservative category match in article body'})
                continue
            if len(passages) != 3:
                reports.append({'source':spec['id'],'url':entry['url'],'reason':'fewer than three supported full sentences'})
                continue
            # Every bullet is explicitly a source statement, not an independent finding.
            item = {'type':kind,'headline':shorten(entry['title']),
                    'summaries':[f"{spec['name']} reports: {s}" for s in passages],
                    'editorNote':f"Automatically selected and excerpted from {spec['name']}. Category assignment is editorial; this draft has not been independently fact-checked.",
                    'source':{'name':spec['name'],'url':entry['url'],'publishedAt':entry['published'].date().isoformat()}}
            candidates.append({'type':kind,'family':spec['family'],'url':entry['url'],'published':entry['published'],'item':item,
                               'audit':{'type':kind,'source':spec['name'],'url':entry['url'],'sourceTitle':entry['title'],'publishedAt':entry['published'].isoformat(),'checkedAt':now.isoformat(),'supportingPassages':passages}})
    return candidates, reports


def select_edition(candidates, used, now):
    groups = [[c for c in candidates if c['type']==kind and c['url'] not in used] for kind in TYPES]
    if any(not group for group in groups):
        return None
    choices = []
    for combo in itertools.product(*groups):
        if len({c['family'] for c in combo}) == 3 and len({c['url'] for c in combo}) == 3:
            choices.append(combo)
    if not choices:
        return None
    # Prefer combinations entirely inside 48h, then recency, then stable URL ordering.
    choices.sort(key=lambda combo:(sum(now-c['published'] > dt.timedelta(hours=48) for c in combo),-sum(c['published'].timestamp() for c in combo),tuple(c['url'] for c in combo)))
    combo=choices[0]
    edition={'date':chicago_date(now),'timezone':'America/Chicago','revision':0,'reviewStatus':'automated','items':[c['item'] for c in combo]}
    return edition, [c['audit'] for c in combo]



def validate_generated_edition(edition):
    if edition.get('timezone') != 'America/Chicago' or edition.get('revision') != 0 or edition.get('reviewStatus') != 'automated':
        raise ValueError('invalid automated edition metadata')
    day = edition.get('date', '')
    if dt.date.fromisoformat(day).isoformat() != day:
        raise ValueError('invalid edition date')
    items = edition.get('items', [])
    if len(items) != 3 or tuple(item.get('type') for item in items) != TYPES:
        raise ValueError('edition must contain Good, Bad and Ugly exactly once')
    for item in items:
        if not isinstance(item.get('headline'), str) or not 1 <= len(item['headline']) <= 30:
            raise ValueError('invalid headline')
        lines = item.get('summaries', [])
        if len(lines) != 3 or not all(isinstance(line,str) and line.strip() for line in lines):
            raise ValueError('three supported summaries required')
        if not item.get('editorNote') or not item.get('source',{}).get('name'):
            raise ValueError('attribution required')
        source = item['source']
        if not source.get('url','').startswith('https://'):
            raise ValueError('secure original source required')
        source_day = source.get('publishedAt', '')
        if dt.date.fromisoformat(source_day).isoformat() != source_day:
            raise ValueError('invalid source publication date')


def read_json(path, default):
    return json.loads(path.read_text()) if path.exists() else default


def write_json(path, value):
    path.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.NamedTemporaryFile('w',dir=path.parent,delete=False,encoding='utf-8') as handle:
        json.dump(value,handle,ensure_ascii=False,indent=2)
        handle.write('\n')
        temporary=handle.name
    os.replace(temporary,path)


def run(root, now, write=False):
    target=root/'src/data/today.json'
    initial=target.read_bytes() if target.exists() else None
    current=json.loads(initial) if initial else None
    day=chicago_date(now)
    if current and current.get('date','') >= day:
        return {'status':'skipped','reason':'current-day or newer edition already exists; owner edits preserved','date':day}
    ledger_path=root/'scripts/data/recent-articles.json'
    ledger=read_json(ledger_path,[])
    cutoff=(now.astimezone(ZoneInfo('America/Chicago')).date()-dt.timedelta(days=30)).isoformat()
    recent=[entry for entry in ledger if isinstance(entry,dict) and entry.get('date','')>=cutoff]
    used={entry['url'] for entry in recent if isinstance(entry.get('url'),str)}
    if current:
        used.update(i.get('source',{}).get('url','') for i in current.get('items',[]))
    specs=read_json(root/'scripts/news_sources.json',[])
    if not specs:
        raise ValueError('no approved sources configured')
    candidates,reports=collect(specs,now,used)
    selected=select_edition(candidates,used,now)
    if not selected:
        return {'status':'skipped','reason':'not enough eligible distinct-source stories for all three categories','date':day,'eligible':{kind:sum(c['type']==kind for c in candidates) for kind in TYPES},'reports':reports}
    edition,audit=selected
    validate_generated_edition(edition)
    result={'status':'draft','edition':edition,'audit':audit,'reports':reports}
    if not write:
        return result
    # Refuse concurrent edits made after collection; workflow also rejects remote races.
    if (target.read_bytes() if target.exists() else None) != initial:
        return {'status':'skipped','reason':'current edition changed during collection; no overwrite','date':day}
    recent.extend({'date':day,'url':entry['url']} for entry in audit)
    write_json(root/'scripts/data/editorial-record.json',{'editionDate':day,'revision':0,'checkedAt':now.isoformat(),'stories':audit})
    write_json(ledger_path,recent)
    write_json(target,edition)
    result['status']='published'
    return result


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    mode=parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--dry-run',action='store_true')
    mode.add_argument('--write',action='store_true')
    parser.add_argument('--output',type=Path,help='optional diagnostic result path, outside publication state')
    args=parser.parse_args()
    forbidden={ROOT/'src/data/today.json',ROOT/'scripts/data/editorial-record.json',ROOT/'scripts/data/recent-articles.json',ROOT/'scripts/news_sources.json'}
    if args.output and args.output.resolve() in {p.resolve() for p in forbidden}:
        print(json.dumps({'status':'error','reason':'diagnostic output cannot overwrite publication files'}))
        return 1
    try:
        result=run(ROOT,dt.datetime.now(UTC),write=args.write)
        code=0
    except Exception as error:
        result={'status':'error','reason':str(error)[:300]}
        code=1
    if args.output:
        write_json(args.output,result)
    print(json.dumps(result,ensure_ascii=False,indent=2))
    return code


if __name__=='__main__':
    raise SystemExit(main())
