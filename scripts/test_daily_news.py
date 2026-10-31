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

    def test_scoped_drupal_body_excludes_surrounding_article_content(self):
        page = b'<nav><p>Navigation must never become a summary sentence.</p></nav><article><header><p>An unrelated header sentence with sufficient length.</p></header><div class="field field--name-body field--type-text-with-summary"><div class="field__item"><p>The FTC alleges that consumers paid unauthorized subscription charges.</p><p>The complaint says the company continued billing after cancellation.</p><p>The allegations remain subject to a decision by the federal court.</p></div></div><footer><p>An unrelated footer sentence with sufficient length.</p></footer></article>'
        body = news.article_body(page)
        self.assertNotIn('header sentence', body)
        self.assertNotIn('footer sentence', body)
        self.assertNotIn('Navigation', body)
        self.assertEqual(len(news.excerpts(body)), 3)
        with self.assertRaises(ValueError):
            news.article_body(b'<main><nav><p>No recognized article here.</p></nav></main>')

    def test_bls_preformatted_release_body(self):
        page = b'<main><div id="bodytext"><pre>Employment declined in several metropolitan areas during September. The unemployment rate increased in a number of other metropolitan areas. These estimates are based on the household and establishment surveys.</pre></div><p>Site contact information outside the release body.</p></main>'
        body = news.article_body(page)
        self.assertNotIn('Site contact', body)
        self.assertEqual(len(news.excerpts(body)), 3)

    def test_bls_pre_contact_block_does_not_discard_release_paragraphs(self):
        page = b'<div id="bodytext"><pre>USDL-26-0000\nTransmission of material is embargoed.\n\nMedia contact: (202) 691-5902\nTechnical information: (202) 691-6392\n\nOver the year, employment decreased in Washington-Arlington-Alexandria\nand several other metropolitan areas.\n\nThe unemployment rate increased in a number of other metropolitan areas.\n\nThese estimates are based on the household and establishment surveys.</pre></div>'
        lines = news.excerpts(news.article_body(page))
        self.assertEqual(len(lines), 3)
        self.assertEqual(lines[0], 'Over the year, employment decreased in Washington-Arlington-Alexandria and several other metropolitan areas.')
        self.assertFalse(any('contact' in line.lower() or 'embargoed' in line for line in lines))

    def collect_with_teaser(self, kind, title, body):
        spec = {**SPEC, 'categories':[kind], 'feeds':['https://www.nasa.gov/feed/']}
        entry = {'title':title, 'url':'https://www.nasa.gov/release', 'published':NOW, 'body':'A short feed teaser.'}
        with patch.object(news,'parse_feed',return_value=[entry]), patch.object(news,'fetch',side_effect=[b'<rss/>',body.encode()]) as fetch:
            candidates, reports = news.collect([spec],NOW,set())
        self.assertEqual(fetch.call_count, 2)
        return candidates, reports

    def test_short_feed_teaser_does_not_prevent_body_classification(self):
        body = '<article><p>Employment declined in several metropolitan areas during September. The unemployment rate increased in a number of other metropolitan areas. These estimates are based on the household and establishment surveys.</p></article>'
        candidates, reports = self.collect_with_teaser('bad','Metropolitan employment release',body)
        self.assertEqual(reports, [])
        self.assertEqual(candidates[0]['type'], 'bad')
        self.assertIn('Employment declined', candidates[0]['item']['summaries'][0])

    def test_ugly_sue_title_requires_supporting_article_allegation(self):
        body = '<article><p>The FTC alleges that consumers paid unauthorized subscription charges. The complaint says the company continued billing after cancellation. These allegations remain subject to a decision by the federal court.</p></article>'
        candidates, reports = self.collect_with_teaser('ugly','FTC and States Sue Company Over Deceptive Fees',body)
        self.assertEqual(reports, [])
        self.assertEqual(candidates[0]['type'], 'ugly')
        self.assertIn('alleges', candidates[0]['item']['summaries'][0])
        neutral = '<article><p>The agency published a detailed report about its public outreach work. The announcement describes several meetings scheduled for next month. Members of the public can read the complete report on the agency website.</p></article>'
        candidates, reports = self.collect_with_teaser('ugly','Agency Discusses Scam Awareness',neutral)
        self.assertEqual(candidates, [])
        self.assertIn('no conservative category match', reports[0]['reason'])

    def test_full_body_requests_stay_within_budget(self):
        spec = {**SPEC, 'categories':['bad'], 'feeds':['https://www.nasa.gov/feed/']}
        entries = [{'title':'Employment report', 'url':f'https://www.nasa.gov/{i}', 'published':NOW, 'body':'Short teaser.'} for i in range(10)]
        with patch.object(news,'parse_feed',return_value=entries), patch.object(news,'fetch',return_value=b'<article><p>No relevant adverse development.</p></article>') as fetch:
            candidates, reports = news.collect([spec],NOW,set())
        self.assertEqual(candidates, [])
        self.assertEqual(fetch.call_count, 1 + news.MAX_ARTICLES_PER_SOURCE)
        self.assertEqual(sum(r['reason']=='article request budget exhausted' for r in reports),4)

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
