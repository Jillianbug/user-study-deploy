"""LAN study server. Persistent records live outside the public website directory."""
import argparse
import csv
import io
import json
import os
import re
import threading
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent
METHODS = {'ours', 'editsplat', 'gaussctrl', 'imix2mix', 'rl3d'}
DIMS = ['instruction_following', 'multi_view_consistency', 'visual_quality']
CASES = [p.parent.relative_to(ROOT / 'study-site/assets').as_posix()
         for p in sorted((ROOT / 'study-site/assets').rglob('prompt.txt'))]
LOCK = threading.Lock()


def validate(s):
    if not isinstance(s, dict) or s.get('version') != 2:
        raise ValueError('Unsupported study version')
    if not re.fullmatch(r'[a-f0-9]{32}', s.get('id', '')):
        raise ValueError('Invalid recovery code')
    if not isinstance(s.get('username'), str) or not 1 <= len(s['username'].strip()) <= 60:
        raise ValueError('Invalid username')
    if type(s.get('index')) is not int or not 0 <= s['index'] < len(CASES):
        raise ValueError('Invalid question')
    if type(s.get('completed')) is not bool:
        raise ValueError('Invalid completion state')
    for key in ['orders', 'answers']:
        if not isinstance(s.get(key), dict) or set(s[key]) != set(CASES):
            raise ValueError('Invalid cases')
    for case in CASES:
        order, answers = s['orders'][case], s['answers'][case]
        if not isinstance(order, list) or len(order) != 5 or set(order) != METHODS:
            raise ValueError('Invalid method order')
        if not isinstance(answers, dict) or not set(answers) <= set(DIMS):
            raise ValueError('Invalid dimensions')
        if any(v not in METHODS for v in answers.values()):
            raise ValueError('Invalid answer')
        if s['completed'] and set(answers) != set(DIMS):
            raise ValueError('Incomplete submission')
    return {k: s[k] for k in ['version', 'id', 'username', 'index', 'completed', 'orders', 'answers']}


def atomic_write(path, content):
    temp = path.with_suffix(path.suffix + '.tmp')
    with temp.open('w', encoding='utf-8', newline='') as f:
        f.write(content)
        f.flush()
        os.fsync(f.fileno())
    os.replace(temp, path)


def safe_cell(value):
    text = str(value)
    return "'" + text if text.lstrip().startswith(('=', '+', '-', '@')) else text


def export_csv(data):
    out = io.StringIO(newline='')
    writer = csv.writer(out)
    writer.writerow(['participant_id', 'username', 'sample', *DIMS, 'completed', 'updated_at'])
    for p in sorted((data / 'sessions').glob('*.json')):
        record = json.loads(p.read_text(encoding='utf-8'))
        s = record['state']
        for case in CASES:
            writer.writerow([s['id'], safe_cell(s['username']), case,
                             *(s['answers'][case].get(d, '') for d in DIMS),
                             s['completed'], record['updated_at']])
    atomic_write(data / 'results.csv', '\ufeff' + out.getvalue())


def make_handler(data):
    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(ROOT / 'study-site'), **kwargs)

        def end_headers(self):
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Content-Type-Options', 'nosniff')
            super().end_headers()

        def reply(self, status, payload):
            body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
            self.send_response(status)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def list_directory(self, path):
            self.send_error(403)
            return None

        def do_GET(self):
            if self.path == '/api/health':
                return self.reply(200, {'ok': True, 'storage': 'disk'})
            if urlsplit(self.path).path.startswith('/api/'):
                return self.reply(404, {'error': 'Not found'})
            super().do_GET()

        def do_POST(self):
            if self.path not in ['/api/save', '/api/resume']:
                return self.reply(404, {'error': 'Not found'})
            # Only same-origin browser writes; do not expose a public cross-origin API.
            origin = self.headers.get('Origin')
            if origin and urlsplit(origin).netloc != self.headers.get('Host'):
                return self.reply(403, {'error': 'Origin not allowed'})
            if self.headers.get_content_type() != 'application/json':
                return self.reply(415, {'error': 'JSON required'})
            try:
                length = int(self.headers.get('Content-Length', '0'))
                if not 0 < length <= 65536:
                    return self.reply(413, {'error': 'Invalid request size'})
                body = json.loads(self.rfile.read(length))
                with LOCK:
                    if self.path == '/api/resume':
                        token = body.get('id', '')
                        if not re.fullmatch(r'[a-f0-9]{32}', token):
                            raise ValueError('Invalid recovery code')
                        path = data / 'sessions' / (token + '.json')
                        if not path.exists():
                            return self.reply(404, {'error': 'Record not found'})
                        return self.reply(200, json.loads(path.read_text(encoding='utf-8')))
                    state = validate(body.get('state'))
                    path = data / 'sessions' / (state['id'] + '.json')
                    previous = json.loads(path.read_text(encoding='utf-8')) if path.exists() else None
                    revision = previous['revision'] if previous else 0
                    if previous and (previous['state']['orders'] != state['orders'] or previous['state']['username'] != state['username']):
                        return self.reply(409, {'error': 'Participant identity or order mismatch'})
                    if previous and previous['state'] == state:
                        record = previous  # Safe retry when a previous response was lost.
                    else:
                        if body.get('revision', 0) != revision:
                            return self.reply(409, {'error': 'Newer progress exists on another page'})
                        record = {'revision': revision + 1, 'updated_at': datetime.now(timezone.utc).isoformat(), 'state': state}
                        atomic_write(path, json.dumps(record, ensure_ascii=False, indent=2))
                    # JSON is the authoritative record; CSV can be rebuilt on restart.
                    try:
                        export_csv(data)
                        csv_ready = True
                    except OSError:
                        csv_ready = False  # Excel may temporarily lock results.csv on Windows.
                    return self.reply(200, {'revision': record['revision'], 'csv_ready': csv_ready})
            except (ValueError, TypeError, KeyError):
                self.reply(400, {'error': 'Invalid request data'})
            except OSError:
                self.reply(500, {'error': 'Could not save to disk'})

    return Handler


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8080)
    parser.add_argument('--bind', default='0.0.0.0')
    parser.add_argument('--data-dir', type=Path, default=ROOT / 'study-data')
    args = parser.parse_args()
    data = args.data_dir.resolve()
    if data.is_relative_to(ROOT / 'study-site'):
        parser.error('Data directory must be outside the public website directory')
    (data / 'sessions').mkdir(parents=True, exist_ok=True)
    try:
        export_csv(data)
    except OSError:
        print('CSV export is locked; close Excel to allow the next save to refresh it.', flush=True)
    server = ThreadingHTTPServer((args.bind, args.port), make_handler(data))
    print(f'Study server: http://{args.bind}:{args.port} | Data: {data}', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
