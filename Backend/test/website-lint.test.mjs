import assert from 'node:assert/strict';
import test from 'node:test';
import { lintWebsiteArtifacts } from '../dist/workflow/phases/website-lint.js';

function file(path, content) {
  return { path, language: path.split('.').pop(), content, bytes: content.length };
}

test('깨끗한 산출물은 지적 사항이 없다', () => {
  const files = [
    file(
      'index.html',
      '<!DOCTYPE html>\n<html lang="ko">\n<head><link rel="stylesheet" href="style.css"></head>\n' +
        '<body>안녕하세요<script src="script.js"></script></body>\n</html>',
    ),
    file('style.css', 'body { color: #222; }'),
    file('script.js', 'console.log("ok");'),
  ];

  assert.deepEqual(lintWebsiteArtifacts(files), []);
});

test('index.html 이 없으면 지적한다', () => {
  const files = [file('style.css', 'body{}')];
  const issues = lintWebsiteArtifacts(files);
  assert.ok(issues.some((i) => i.includes('index.html')));
});

test('자리표시자 텍스트를 잡아낸다', () => {
  const files = [
    file('index.html', '<!DOCTYPE html>\n<html><body>Lorem ipsum dolor</body></html>'),
  ];
  const issues = lintWebsiteArtifacts(files);
  assert.ok(issues.some((i) => i.includes('Lorem ipsum')));
});

test('만들어지지 않은 파일을 참조하면 잡아낸다', () => {
  const files = [
    file(
      'index.html',
      '<!DOCTYPE html>\n<html><head><link rel="stylesheet" href="missing.css"></head>' +
        '<body>ok</body></html>',
    ),
  ];
  const issues = lintWebsiteArtifacts(files);
  assert.ok(issues.some((i) => i.includes('missing.css')));
});

test('외부 리소스 참조를 잡아낸다', () => {
  const files = [
    file(
      'index.html',
      '<!DOCTYPE html>\n<html><head>' +
        '<link rel="stylesheet" href="https://cdn.example.com/a.css"></head>' +
        '<body>ok</body></html>',
    ),
  ];
  const issues = lintWebsiteArtifacts(files);
  assert.ok(issues.some((i) => i.includes('외부 리소스')));
});

test('앵커·데이터 URI·메일 링크는 무시한다', () => {
  const files = [
    file(
      'index.html',
      '<!DOCTYPE html>\n<html><body>' +
        '<a href="#top">top</a><a href="mailto:a@b.com">mail</a>' +
        '<img src="data:image/svg+xml;base64,abc">' +
        '</body></html>',
    ),
  ];
  assert.deepEqual(lintWebsiteArtifacts(files), []);
});
