"""Execute the real workflow commit step against temporary local Git remotes."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import textwrap
import unittest


WORKFLOW = Path(__file__).resolve().parents[1] / '.github/workflows/publish.yml'
PUBLICATION_FILES = ('src/data/today.json', 'scripts/data/editorial-record.json', 'scripts/data/recent-articles.json')


class StatusPublicationTests(unittest.TestCase):
    def git(self, root, *args):
        return subprocess.run(['git', *args], cwd=root, check=True, text=True, capture_output=True).stdout.strip()

    def make_repository(self, root):
        remote = root / 'remote.git'
        self.git(root, 'init', '--bare', str(remote))
        work = root / 'work'
        work.mkdir()
        self.git(work, 'init', '-b', 'main')
        self.git(work, 'config', 'user.name', 'Workflow test')
        self.git(work, 'config', 'user.email', 'workflow-test@example.test')
        self.git(work, 'config', 'core.hooksPath', '/dev/null')
        for relative in PUBLICATION_FILES:
            path = work / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text('{"owner":"unchanged"}\n')
        self.git(work, 'add', '--', *PUBLICATION_FILES)
        self.git(work, 'commit', '-m', 'Existing owner edition')
        self.git(work, 'remote', 'add', 'origin', str(remote))
        self.git(work, 'push', 'origin', 'HEAD:main')
        start = self.git(work, 'rev-parse', 'HEAD')
        status = work / 'public/collection-status.json'
        status.parent.mkdir()
        status.write_text(json.dumps({'version': 1, 'outcome': 'skipped', 'reason': 'insufficient-stories'}))
        return work, remote, start

    def publish(self, work, start, status='skipped'):
        section = WORKFLOW.read_text().split('      - name: Publish only if the owner has not changed the branch\n', 1)[1].split('\n  build:', 1)[0]
        script = textwrap.dedent(section.split('        run: |\n', 1)[1])
        output = work.parent / 'github-output'
        return subprocess.run(['bash', '-c', script], cwd=work, text=True, capture_output=True,
                              env={**os.environ, 'START_COMMIT': start, 'DRAFT_STATUS': status, 'GITHUB_OUTPUT': str(output)})

    def test_skipped_collection_commits_only_status_and_preserves_owner_edition(self):
        with tempfile.TemporaryDirectory() as directory:
            work, remote, start = self.make_repository(Path(directory))
            result = self.publish(work, start)
            self.assertEqual(result.returncode, 0, result.stderr)
            end = self.git(work, 'rev-parse', 'HEAD')
            self.assertNotEqual(start, end)
            self.assertEqual(self.git(work, 'diff', '--name-only', start, end), 'public/collection-status.json')
            for relative in PUBLICATION_FILES:
                self.assertEqual((work / relative).read_text(), '{"owner":"unchanged"}\n')
            self.assertEqual(self.git(work, 'ls-remote', 'origin', 'refs/heads/main').split()[0], end)
            self.assertEqual((work.parent / 'github-output').read_text(), f'commit={end}\n')

    def test_changed_owner_branch_rejects_even_a_status_only_commit(self):
        with tempfile.TemporaryDirectory() as directory:
            work, remote, start = self.make_repository(Path(directory))
            owner = Path(directory) / 'owner'
            self.git(Path(directory), 'clone', '-b', 'main', str(remote), str(owner))
            self.git(owner, 'config', 'user.name', 'Owner')
            self.git(owner, 'config', 'user.email', 'owner@example.test')
            self.git(owner, 'config', 'core.hooksPath', '/dev/null')
            (owner / PUBLICATION_FILES[0]).write_text('{"owner":"new correction"}\n')
            self.git(owner, 'add', '--', PUBLICATION_FILES[0])
            self.git(owner, 'commit', '-m', 'Owner correction')
            self.git(owner, 'push', 'origin', 'HEAD:main')
            owner_commit = self.git(owner, 'rev-parse', 'HEAD')
            result = self.publish(work, start)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('publishing branch changed', result.stderr)
            self.assertEqual(self.git(work, 'rev-parse', 'HEAD'), start)
            self.assertEqual(self.git(work, 'ls-remote', 'origin', 'refs/heads/main').split()[0], owner_commit)
            self.assertFalse((work.parent / 'github-output').exists())

    def test_skipped_collection_rejects_unexpected_article_mutation(self):
        with tempfile.TemporaryDirectory() as directory:
            work, _, start = self.make_repository(Path(directory))
            (work / PUBLICATION_FILES[0]).write_text('{"unexpected":"mutation"}')
            result = self.publish(work, start)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('skipped collection unexpectedly changed publishing files', result.stderr)
            self.assertEqual(self.git(work, 'rev-parse', 'HEAD'), start)
            self.assertFalse((work.parent / 'github-output').exists())

    def test_publication_requires_changed_articles_even_when_report_changed(self):
        with tempfile.TemporaryDirectory() as directory:
            work, _, start = self.make_repository(Path(directory))
            result = self.publish(work, start, 'published')
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('publication without a content change', result.stderr)
            self.assertEqual(self.git(work, 'rev-parse', 'HEAD'), start)


if __name__ == '__main__':
    unittest.main()
