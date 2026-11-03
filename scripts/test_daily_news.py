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

    def test_fetch_negotiates_a_text_xml_only_feed_without_weakening_xml_validation(self):
        url = 'https://www.nasa.gov/feed/'
        xml = Path(__file__).with_name('fixtures').joinpath('news.xml').read_bytes()
        with patch.object(news.urllib.request,'build_opener') as opener:
            context = opener.return_value.open.return_value
            response = context.__enter__.return_value
            response.geturl.return_value = url
            response.read.return_value = xml
            def negotiate(request, timeout):
                accepted = {value.split(';',1)[0].strip() for value in request.get_header('Accept','').split(',')}
                if 'text/xml' not in accepted:
                    raise news.urllib.error.HTTPError(url,406,'Not Acceptable',None,None)
                return context
            opener.return_value.open.side_effect = negotiate
            data = news.fetch(url,SPEC)
        self.assertEqual(len(news.parse_feed(data,SPEC,NOW)),1)
        with self.assertRaises(ValueError): news.parse_feed(b'<html>Not a news feed</html>',SPEC,NOW)

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
        candidates, reports = self.collect_with_teaser('ugly','Agency Discusses Scam Reports',neutral)
        self.assertEqual(candidates, [])
        self.assertIn('no conservative category match', reports[0]['reason'])

    def test_mixed_employment_report_keeps_context_and_adverse_evidence(self):
        opening = 'Unemployment rates were lower in 226 areas, higher in 138 areas, and unchanged in 23 areas.'
        context = 'Most metropolitan areas had little change in their payroll employment over the year.'
        mixed = 'Nonfarm payroll employment increased in 11 areas, decreased in 3 areas, and was unchanged in 373 areas.'
        adverse = 'Over the year, employment decreased in Washington-Arlington-Alexandria and two other metropolitan areas.'
        body = '<article><p>' + ' '.join([opening,context,mixed,adverse]) + '</p></article>'
        candidates, reports = self.collect_with_teaser('bad','Jobless rates down in most metropolitan areas',body)
        self.assertEqual(reports, [])
        item = candidates[0]['item']
        self.assertEqual(item['headline'], 'Employment declines reported')
        self.assertTrue(item['summaries'][0].endswith(opening))
        self.assertTrue(item['summaries'][1].endswith(context))
        self.assertTrue(item['summaries'][2].endswith(adverse))
        self.assertEqual(candidates[0]['audit']['sourceTitle'], 'Jobless rates down in most metropolitan areas')
        selected = {'title':item['headline'], 'body':' '.join(item['summaries'])}
        self.assertEqual(news.category(selected, {'categories':['bad']}), 'bad')

    def test_ugly_selected_passages_include_actual_alleged_wrongdoing(self):
        opening = 'The company markets and sells payment processing services to small businesses.'
        context = 'Its products are used to manage orders and accept payments from customers.'
        neutral = 'The company sells its software through an annual subscription service.'
        allegation = 'The FTC alleges that the company deceptively concealed unauthorized subscription fees.'
        body = '<article><p>' + ' '.join([opening,context,neutral,allegation]) + '</p></article>'
        candidates, reports = self.collect_with_teaser('ugly','FTC Takes Action Over Deceptive Subscription Fees',body)
        self.assertEqual(reports, [])
        item = candidates[0]['item']
        self.assertTrue(item['summaries'][0].endswith(opening))
        self.assertTrue(item['summaries'][1].endswith(context))
        self.assertTrue(item['summaries'][2].endswith(allegation))
        selected = {'title':item['headline'], 'body':' '.join(item['summaries'])}
        # The source title, rather than a shortened card title, drives selection.
        selected['title'] = candidates[0]['audit']['sourceTitle']
        self.assertEqual(news.category(selected, {'categories':['ugly']}), 'ugly')
        self.assertIsNone(news.category({'title':selected['title'], 'body':'The agency sues a company and charges a filing fee.'}, {'categories':['ugly']}))

    def test_generic_complaint_and_business_description_are_not_wrongdoing_evidence(self):
        body = '<article><p>The agency filed a complaint in federal court against the company. The company sells payment processing software to small businesses. Customers use the software to take orders and manage their inventory.</p></article>'
        candidates, reports = self.collect_with_teaser('ugly','FTC Takes Action Over Deceptive Subscription Fees',body)
        self.assertEqual(candidates, [])
        self.assertIn('no conservative category match', reports[0]['reason'])

    def test_quote_fragments_are_omitted_and_unquoted_sentences_preferred(self):
        plain_sentences = ['The complaint alleges that consumers paid unauthorized subscription charges.',
                           'Customers reported that the company continued charging after cancellation.',
                           'The allegations remain subject to a decision by the federal court.']
        for opening, closing in [('“','”'), ('"','"')]:
            quote = opening + 'The agency takes these allegations very seriously. Consumers deserve clear and accurate subscription terms. The court will consider the evidence in this case.' + closing
            body = '<p>' + quote + '</p><p>' + ' '.join(plain_sentences) + '</p>'
            self.assertEqual(news.excerpts(body), plain_sentences)
        balanced = '<p>“The agency takes these allegations very seriously,” the director said.</p><p>' + ' '.join(plain_sentences) + '</p>'
        self.assertEqual(news.excerpts(balanced), plain_sentences)

    def test_ugly_prefilter_excludes_wrapups_warnings_and_inquiries(self):
        spec = {'categories':['ugly']}
        for title in ['FTC Highlights Efforts to Combat Imposter Scams', 'FTC Warns Marketers Against Deceptive Claims', 'FTC Opens Inquiry Into Potential Fraud', 'FTC Shares Scam Awareness Tips']:
            with self.subTest(title=title):
                entry = {'title':title, 'body':'The complaint alleges fraud and deceptive claims.'}
                self.assertFalse(news.possible_category(entry,spec))
                self.assertIsNone(news.category(entry,spec))
        self.assertTrue(news.possible_category({'title':'FTC and States Sue Company Over Deceptive Fees'},spec))

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

    def test_nsf_body_keeps_uncertainty_and_does_not_split_a_name_initial(self):
        first = 'NSF–DOE Vera C. Rubin Observatory has found a large object that scientists have identified as a possible dwarf planet.'
        second = 'A preliminary data analysis shows that the object may be one of the largest dwarf planet candidates ever found.'
        third = 'If confirmed, the object would join the five other known dwarf planets in the solar system.'
        page = '<main><article><p>Related news should not supply the selected article paragraphs.</p></article><div class="clearfix text-formatted field field-news-body"><p>' + ' '.join([first, second, third]) + '</p></div></main>'
        lines = news.excerpts(news.article_body(page.encode()))
        self.assertEqual(lines, [first, second, third])

    def test_pce_price_increase_requires_an_affirmative_reported_change(self):
        spec = {'categories':['bad']}
        for sentence in ['From the preceding month, the PCE price index for September increased 0.5 percent.',
                         'The PCE price index increased 0.5 percent from the previous month.']:
            self.assertEqual(news.category({'title':'Personal Income and Outlays', 'body':sentence}, spec), 'bad')
            self.assertEqual(news.bad_headline([sentence]), 'PCE price increases reported')
        for sentence in ['The stock price index for September increased 0.5 percent.',
                         'The PCE price index for September decreased 0.5 percent.',
                         'The PCE price index was unchanged during September.',
                         'The PCE price index is expected to increase next month.']:
            self.assertIsNone(news.category({'title':'Personal Income and Outlays', 'body':sentence}, spec))

    def test_reprint_notice_outside_the_body_cannot_be_bypassed_with_full_feed_text(self):
        body = '<p>Researchers discovered a possible new dwarf planet in the outer solar system. Preliminary observations indicate that it may have a very distant orbit. If confirmed, the discovery would add another dwarf planet to the known solar system.</p>'
        entry = {'title':'Scientists discover possible dwarf planet','url':'https://www.nsf.gov/news/release','published':NOW,'body':body}
        spec = {**SPEC,'id':'nsf','name':'NSF','hosts':['www.nsf.gov'],'feeds':['https://www.nsf.gov/rss/news.xml'],
                'requireArticleBody':True,'rejectThirdPartyReprints':True}
        notice = '<section><h2>This article was originally published by Rubin Observatory. It has been edited for length and style.</h2></section>'
        page = ('<main><div class="field-news-body">'+body+'</div>'+notice+'</main>').encode()
        with patch.object(news,'parse_feed',return_value=[entry]), patch.object(news,'fetch',side_effect=[b'<rss/>',page]) as fetch:
            candidates,reports = news.collect([spec],NOW,set())
        self.assertEqual(fetch.call_count,2)
        self.assertEqual(candidates,[])
        self.assertIn('third-party reprinted',reports[0]['reason'])
        own_page = ('<main><div class="field-news-body">'+body+'</div></main>').encode()
        with patch.object(news,'parse_feed',return_value=[entry]), patch.object(news,'fetch',side_effect=[b'<rss/>',own_page]) as fetch:
            candidates,reports = news.collect([spec],NOW,set())
        self.assertEqual(fetch.call_count,2)
        self.assertEqual(reports,[])
        self.assertEqual(len(candidates),1)

    def test_new_source_paths_do_not_relax_host_or_date_validation(self):
        spec = {**SPEC, 'hosts':['www.justice.gov'], 'articlePathPrefixes':['/opa/pr/']}
        def feed(url, date='Thu, 29 Oct 2026 18:00:00 +0000'):
            return f'<rss><channel><item><title>Agency Charges Fraud</title><link>{url}</link><pubDate>{date}</pubDate><description>A description.</description></item></channel></rss>'.encode()
        self.assertEqual(len(news.parse_feed(feed('https://www.justice.gov/opa/pr/agency-case'),spec,NOW)),1)
        for url in ['https://www.justice.gov/video/fraud', 'https://www.justice.gov/opa/pr-other/fraud',
                    'https://www.justice.gov.evil.test/opa/pr/fraud', 'http://www.justice.gov/opa/pr/fraud']:
            with self.subTest(url=url): self.assertEqual(news.parse_feed(feed(url),spec,NOW),[])
        self.assertEqual(news.parse_feed(feed('https://www.justice.gov/opa/pr/fraud','Sat, 31 Oct 2026 18:00:00 +0000'),spec,NOW),[])
        self.assertEqual(news.parse_feed(feed('https://www.justice.gov/opa/pr/fraud','Thu, 01 Oct 2026 18:00:00 +0000'),spec,NOW),[])

    def test_legacy_http_feed_links_upgrade_only_on_the_explicit_allowed_source(self):
        spec = {'id':'fda','hosts':['www.fda.gov'],'categories':['good'],'upgradeHttpLinks':True,
                'articlePathPrefixes':['/news-events/press-announcements/']}
        def feed(url):
            return f'<rss><channel><item><title>FDA Approves New Treatment</title><link>{url}</link><pubDate>Thu, 29 Oct 2026 18:00:00 +0000</pubDate><description>A feed teaser.</description></item></channel></rss>'.encode()
        path = '/news-events/press-announcements/new-treatment'
        for authority in ['www.fda.gov','www.fda.gov:80']:
            entries = news.parse_feed(feed('http://'+authority+path),spec,NOW)
            self.assertEqual(entries[0]['url'],'https://www.fda.gov'+path)
        for url in ['http://evil.test'+path,'http://www.fda.gov.evil.test'+path,
                    'http://name@www.fda.gov'+path,'http://@www.fda.gov'+path,
                    'http://www.fda.gov:443'+path,'http://www.fda.gov:8080'+path,
                    'http://www.fda.gov/food/third-party-recall']:
            with self.subTest(url=url): self.assertEqual(news.parse_feed(feed(url),spec,NOW),[])
        self.assertEqual(news.parse_feed(feed('http://www.fda.gov'+path),{**spec,'upgradeHttpLinks':False},NOW),[])
        self.assertFalse(news.allowed_url('http://www.fda.gov'+path,spec))

    def test_article_redirects_and_final_urls_must_remain_in_the_source_article_scope(self):
        spec = {'hosts':['www.fda.gov'],'articlePathPrefixes':['/news-events/press-announcements/']}
        article_spec = {**spec,'_articleRequest':True}
        source = 'https://www.fda.gov/news-events/press-announcements/release'
        request = news.urllib.request.Request(source)
        redirect = news.SafeRedirect(article_spec)
        with self.assertRaises(ValueError):
            redirect.redirect_request(request,None,302,'',{},'https://www.fda.gov/safety/recalls/firm-announcement')
        follow = redirect.redirect_request(request,None,302,'',{},source+'-canonical')
        self.assertEqual(follow.full_url,source+'-canonical')
        self.assertTrue(news.allowed_url('https://www.fda.gov/about-fda/press/rss.xml',spec))
        self.assertFalse(news.allowed_url('https://www.fda.gov/about-fda/press/rss.xml',article_spec))
        with patch.object(news.urllib.request,'build_opener') as opener:
            response=opener.return_value.open.return_value.__enter__.return_value
            response.geturl.return_value='https://www.fda.gov/safety/recalls/firm-announcement'
            with self.assertRaises(ValueError): news.fetch(source,article_spec)

    def test_fda_good_requires_an_affirmative_approval_title(self):
        spec = {'id':'fda','categories':['good']}
        self.assertEqual(news.category({'title':'FDA Approves First Treatment for a Rare Disease','body':'An official approval.'},spec),'good')
        for title in ['FDA Withdraws Approval of a Treatment','FDA Revokes Approval of a Treatment',
                      'FDA Approves Withdrawal of a Dangerous Product','FDA Considers a Potential Approval',
                      'FDA Announces Review of a New Treatment']:
            with self.subTest(title=title): self.assertIsNone(news.category({'title':title,'body':'An agency announcement.'},spec))
        self.assertIsNone(news.category({'title':'FDA Approves New Treatment','body':'An agency announcement.'},{'id':'other','categories':['good']}))

    def test_professional_degrees_do_not_cut_attribution_or_approval_limitations(self):
        first = 'The agency granted accelerated approval for a therapy that may reduce the frequency of surgical procedures.'
        second = 'Director Karim Mikhail, B. Pharm., M.S. explained that approval relies on an intermediate clinical endpoint.'
        third = 'The manufacturer must conduct post-approval clinical trials to verify and describe the clinical benefit.'
        self.assertEqual(news.excerpts('<p>'+' '.join([first,second,third])+'</p>'),[first,second,third])

    def fallback_specs_and_responses(self):
        definitions = [('nasa','www.nasa.gov','good','science','/news/'),
                       ('bls','www.bls.gov','bad','economy','/news/'),
                       ('ftc','www.ftc.gov','ugly','consumer','/news/'),
                       ('nsf','www.nsf.gov','good','science','/news/'),
                       ('fda','www.fda.gov','good','health','/news-events/press-announcements/'),
                       ('bea','www.bea.gov','bad','economy','/news/'),
                       ('doj','www.justice.gov','ugly','justice','/opa/pr/')]
        specs = [{'id':key,'name':key.upper(),'hosts':[host],'feeds':[f'https://{host}/feed.xml'],
                  'categories':[kind],'family':family,'articlePathPrefixes':[prefix]}
                 for key,host,kind,family,prefix in definitions]
        for spec in specs[3:5]:
            spec.update(requireArticleBody=True,rejectThirdPartyReprints=True)
        specs[4]['upgradeHttpLinks'] = True
        titles = {'nsf':'Scientists discover possible dwarf planet', 'fda':'FDA Approves New Treatment', 'bea':'Personal Income and Outlays', 'doj':'Doctor Sentenced for Medicare Fraud'}
        bodies = {'nsf':'<div class="field-news-body"><p>NSF–DOE Vera C. Rubin Observatory has found a possible dwarf planet beyond Pluto. Preliminary observations indicate that the object may have a very distant orbit. If confirmed, the discovery would add another dwarf planet to the known solar system.</p></div><section>This article was originally published by another organization.</section>',
                  'fda':'<article><p>The FDA granted accelerated approval for a treatment for adults with a rare disease. The approval relies on an intermediate endpoint reasonably likely to predict clinical benefit. The manufacturer must conduct additional clinical trials to verify the clinical benefit.</p></article>',
                  'bea':'<article><p>Personal income increased during September according to the latest estimates. Consumer spending also increased from the previous month in the national estimates. From the preceding month, the PCE price index for September increased 0.5 percent.</p></article>',
                  'doj':'<article><p>A federal court sentenced a doctor after the jury found him guilty of Medicare fraud. According to court documents, the defendant submitted fraudulent claims for treatment. The sentence follows a trial where the government presented evidence of the scheme.</p></article>'}
        responses = {}
        for spec in specs[3:]:
            key = spec['id']; url = f"https://{spec['hosts'][0]}{spec['articlePathPrefixes'][0]}release"
            feed_url = url.replace('https:', 'http:') if key == 'fda' else url
            responses[spec['feeds'][0]] = f'<rss><channel><item><title>{titles[key]}</title><link>{feed_url}</link><pubDate>Thu, 29 Oct 2026 18:00:00 +0000</pubDate><description>A short feed teaser.</description></item></channel></rss>'.encode()
            responses[url] = bodies[key].encode()
        return specs, responses

    def test_all_three_original_publishers_can_fail_without_losing_the_edition(self):
        specs,responses=self.fallback_specs_and_responses()
        def fetch(url, spec):
            if url not in responses: raise OSError('Original publisher unavailable')
            return responses[url]
        with patch.object(news,'fetch',side_effect=fetch):
            candidates,reports=news.collect(specs,NOW,set())
        self.assertEqual({candidate['sourceId'] for candidate in candidates},{'fda','bea','doj'})
        self.assertEqual(len(reports),4)
        self.assertTrue(any('third-party reprinted' in report['reason'] for report in reports))
        selected=news.select_edition(candidates,set(),NOW)
        self.assertIsNotNone(selected)
        news.validate_generated_edition(selected[0])
        self.assertEqual([item['source']['name'] for item in selected[0]['items']],['FDA','BEA','DOJ'])
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);(root/'scripts').mkdir();(root/'scripts/news_sources.json').write_text(json.dumps(specs))
            with patch.object(news,'fetch',side_effect=fetch): result=news.run(root,NOW)
            self.assertEqual(result['sourceCandidates'],{'nasa':0,'bls':0,'ftc':0,'nsf':0,'fda':1,'bea':1,'doj':1})

    def test_all_fallbacks_failing_keeps_published_bytes_and_reports_zero_candidates(self):
        specs,_=self.fallback_specs_and_responses()
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);(root/'scripts').mkdir();(root/'scripts/news_sources.json').write_text(json.dumps(specs))
            target=root/'src/data/today.json';target.parent.mkdir(parents=True)
            original=b'{"date":"2026-10-28","items":[]}\n';target.write_bytes(original)
            with patch.object(news,'fetch',side_effect=OSError('Source unavailable')):
                result=news.run(root,NOW,write=True)
            self.assertEqual(result['status'],'skipped')
            self.assertEqual(result['sourceCandidates'],{spec['id']:0 for spec in specs})
            self.assertEqual(target.read_bytes(),original)
            self.assertFalse((root/'scripts/data/editorial-record.json').exists())

if __name__=='__main__': unittest.main()
