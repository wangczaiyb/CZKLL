"""Local entry point. The static dist directory can also use any HTTP host."""
import argparse
import functools
import json
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

from route_service import segment

ROOT = Path(__file__).resolve().parent


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'strict-origin-when-cross-origin')
        super().end_headers()

    def do_GET(self):
        request_url = urlsplit(self.path)
        if request_url.path == '/api/study-route':
            try:
                values = parse_qs(request_url.query)
                start = [float(value) for value in values['from'][0].split(',')]
                end = [float(value) for value in values['to'][0].split(',')]
                if len(start) != 2 or len(end) != 2:
                    raise ValueError('Expected two coordinates')
                result, status = segment(start, end), 200
            except (KeyError, ValueError):
                result, status = {'status':'invalid_request','reason':'需要有效的WGS84起终点坐标'}, 400
            body = json.dumps(result, ensure_ascii=False).encode('utf-8')
            self.send_response(status)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            try:
                self.wfile.write(body)
            except (BrokenPipeError, ConnectionResetError):
                pass
            return
        if self.path == '/api/health':
            candidate_script = (ROOT / 'dist/geography-candidates.js').read_text(encoding='utf-8')
            summary = json.loads(candidate_script[len('window.GEOGRAPHY_CANDIDATES='):-1])['summary']
            body = json.dumps({'status': 'ok', 'geography': summary}, ensure_ascii=False).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8766)
    parser.add_argument('--host', default='127.0.0.1')
    args = parser.parse_args()
    handler = functools.partial(Handler, directory=str(ROOT / 'dist'))
    with ThreadingHTTPServer((args.host, args.port), handler) as server:
        print(f'http://{args.host}:{args.port}', flush=True)
        server.serve_forever()


if __name__ == '__main__':
    main()
