import datetime as dt
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import daily_news as news

NOW = dt.datetime(2026, 10, 30, 18, tzinfo=dt.timezone.utc)
SPEC = {'id':'nasa', 'name':'NASA', 'hosts':['www.nasa.gov','science.nasa.gov'], 'family':'science', 'categories':['good']}

class CollectorTests(unittest.TestCase):
    def test_url_allowlist(self):
        for bad in ['http://www.nasa.gov/x','https://www.nasa.gov.evil.test/x','https://user@www.nasa.gov/x','https://www.nasa.gov:444/x','https://localhost/x']:
            with self.subTest(bad=bad): self.assertFalse(news.allowed_url(bad, SPEC))
        self.assertTrue(news.allowed_url('https://science.nasa.gov/a', SPEC))

    def test_feed_fixture(self):
        entries = news.parse_feed(Path(__file__).with_name('fixtures').joinpath('news.xml').read_bytes(), SPEC, NOW)
        self.assertEqual(len(entries), 1)
        self.assertEqual(entries[0]['title'], 'NASA discovers new worlds')
        self.assertEqual(entries[0]['published'].date().isoformat(),'2026-10-29')

    def test_reject_html_and_entity_xml(self):
        for data in [b'<html><p>Denied</p></html>',b'<!DOCTYPE rss [<!ENTITY a "x">]><rss/>']:
            with self.assertRaises(ValueError): news.parse_feed(data,SPEC,NOW)

    def test_atom_requires_published_not_update(self):
        atom=b'<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>NASA discovers worlds</title><link href="https://www.nasa.gov/a"/><updated>2026-10-29T00:00:00Z</updated><summary>Text.</summary></entry></feed>'
        self.assertEqual(news.parse_feed(atom,SPEC,NOW),[])

    def test_missing_future_stale_dates(self):
        for date in ['', 'Fri, 31 Oct 2026 20:00:00 +0000','Fri, 02 Oct 2026 20:00:00 +0000']:
            xml=Path(__file__).with_name('fixtures').joinpath('news.xml').read_text().replace('Thu, 29 Oct 2026 18:00:00 +0000', date)
            self.assertEqual(news.parse_feed(xml.encode(), SPEC,NOW),[])

    def test_supporting_full_sentences(self):
        sentences=news.excerpts('<p>NASA discovered a new system with three planets. The telescope measured their light across multiple nights. Scientists will investigate these results in further observations.</p>')
        self.assertEqual(len(sentences),3)
        self.assertEqual(sentences[0],'NASA discovered a new system with three planets.')
        self.assertEqual(news.excerpts('<p>Just a title without enough context.</p>'),[])

    def test_shortage_and_duplicate(self):
        candidate={'type':'good','family':'science','url':'https://www.nasa.gov/a','published':NOW,'item':{},'audit':{}}
        self.assertIsNone(news.select_edition([candidate],set(),NOW))
        self.assertIsNone(news.select_edition([candidate],{candidate['url']},NOW))

    def test_chicago_date_and_dst(self):
        self.assertEqual(news.chicago_date(dt.datetime.fromisoformat('2026-11-01T04:30:00+00:00')),'2026-10-31')
        self.assertEqual(news.chicago_date(dt.datetime.fromisoformat('2026-11-01T07:30:00+00:00')),'2026-11-01')

    def candidates(self):
        result=[]
        for kind, family, host in [('good','science','www.nasa.gov'),('bad','economy','www.bls.gov'),('ugly','consumer','www.ftc.gov')]:
            url=f'https://{host}/{kind}'
            item={'type':kind,'headline':'A supported headline','summaries':['A supported source sentence.']*3,'editorNote':'Attributed automated draft.', 'source':{'name':host,'url':url,'publishedAt':'2026-10-29'}}
            result.append({'type':kind,'family':family,'url':url,'published':NOW-dt.timedelta(days=1),'item':item,'audit':{'url':url,'supportingPassages':item['summaries']}})
        return result

    def test_selects_three_distinct_families_deterministically(self):
        selected=news.select_edition(self.candidates(),set(),NOW)
        self.assertEqual(selected,news.select_edition(list(reversed(self.candidates())),set(),NOW))
        self.assertEqual([i['type'] for i in selected[0]['items']],['good','bad','ugly'])
        news.validate_generated_edition(selected[0])
        self.assertEqual(selected[0]['reviewStatus'],'automated')

    def test_same_family_is_rejected(self):
        candidates=self.candidates(); candidates[1]['family']='science'
        self.assertIsNone(news.select_edition(candidates,set(),NOW))

    def test_long_headline_word_boundary(self):
        headline=news.shorten('NASA scientists discover a new nearby planetary system')
        self.assertLessEqual(len(headline),30)
        self.assertTrue(headline.endswith('…'))
        self.assertTrue('NASA scientists discover a new nearby planetary system'.startswith(headline[:-1]))

    def test_allegations_are_not_removed(self):
        paragraphs='<p>The FTC alleges the company made deceptive claims about its subscription fees. According to the complaint, customers were charged without proper consent. These allegations have not been decided by a court.</p>'
        lines=news.excerpts(paragraphs)
        self.assertEqual(len(lines),3)
        self.assertIn('alleges',lines[0]); self.assertIn('complaint',lines[1]); self.assertIn('not been decided',lines[2])

    def test_research_headlines_are_not_automatically_good(self):
        for title in ['NASA Study Finds Accelerating Ice Loss', 'NASA Study Reveals New Atmospheric Results', 'NASA Discovers a Dangerous Radiation Risk', 'NASA Completes Study of Flood Damage']:
            with self.subTest(title=title):
                self.assertIsNone(news.category({'title':title, 'body':'A scientific report.'}, SPEC))
        self.assertEqual(news.category({'title':'NASA Successfully Completes Telescope Test','body':'A successful test.'}, SPEC),'good')

    def test_redirect_outside_host_is_blocked(self):
        redirect=news.SafeRedirect(SPEC)
        with self.assertRaises(ValueError): redirect.redirect_request(None,None,302,'',{},'https://evil.test/feed')

    def test_dryrun_does_not_publish(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);(root/'scripts').mkdir();(root/'scripts/news_sources.json').write_text('[{}]')
            with patch.object(news,'collect',return_value=(self.candidates(),[])):
                result=news.run(root,NOW,write=False)
            self.assertEqual(result['status'],'draft')
            self.assertFalse((root/'src/data/today.json').exists())
            self.assertFalse((root/'scripts/data/editorial-record.json').exists())

    def test_concurrent_owner_edit_wins(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);(root/'scripts').mkdir();(root/'scripts/news_sources.json').write_text('[{}]')
            target=root/'src/data/today.json';target.parent.mkdir(parents=True);target.write_text('{"date":"2026-10-29","items":[]}')
            def change(*args):
                target.write_text('{"date":"2026-10-30","owner":"edited","items":[]}')
                return self.candidates(),[]
            with patch.object(news,'collect',side_effect=change):result=news.run(root,NOW,write=True)
            self.assertEqual(result['status'],'skipped')
            self.assertEqual(json.loads(target.read_text())['owner'],'edited')
            self.assertFalse((root/'scripts/data/editorial-record.json').exists())

    def test_published_payload_and_record(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);(root/'scripts').mkdir();(root/'scripts/news_sources.json').write_text('[{}]')
            with patch.object(news,'collect',return_value=(self.candidates(),[])):
                result=news.run(root,NOW,write=True)
            self.assertEqual(result['status'],'published')
            self.assertEqual(json.loads((root/'src/data/today.json').read_text()),result['edition'])
            self.assertEqual(len(json.loads((root/'scripts/data/recent-articles.json').read_text())),3)

    def test_current_day_never_overwritten(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory); target=root/'src/data/today.json';target.parent.mkdir(parents=True)
            original={'date':'2026-10-30','reviewStatus':'reviewed','items':[]};target.write_text(json.dumps(original))
            with patch.object(news,'collect',side_effect=AssertionError('must not collect')):
                result=news.run(root,NOW,write=True)
            self.assertEqual(result['status'],'skipped')
            self.assertEqual(json.loads(target.read_text()),original)

if __name__=='__main__': unittest.main()
