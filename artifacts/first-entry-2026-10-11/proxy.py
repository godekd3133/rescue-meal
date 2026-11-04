"""Loopback-only preview proxy; leaves the API's CORS configuration unchanged."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from http.client import HTTPConnection
ORIGIN = 'http://127.0.0.1:4184'
class PreviewProxy(BaseHTTPRequestHandler):
    def permitted(self):
        return self.headers.get('Origin') in (None, ORIGIN)
    def cors(self):
        self.send_header('Access-Control-Allow-Origin', ORIGIN)
        self.send_header('Vary', 'Origin')
    def do_OPTIONS(self):
        if not self.permitted():
            self.send_error(403); return
        self.send_response(204); self.cors()
        self.send_header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
        self.send_header('Access-Control-Allow-Headers', self.headers.get('Access-Control-Request-Headers', 'Content-Type,Authorization'))
        self.end_headers()
    def forward(self):
        if not self.permitted() or not self.path.startswith(('/api/', '/health', '/ready')):
            self.send_error(403); return
        body = self.rfile.read(int(self.headers.get('Content-Length', 0)))
        headers = {k:v for k,v in self.headers.items() if k.lower() not in ('host','origin','connection','content-length')}
        # Preserve the upstream's exposed revision headers through its approved local origin.
        headers['Origin'] = 'http://127.0.0.1:4182'
        upstream = HTTPConnection('127.0.0.1', 8088, timeout=65)
        try:
            upstream.request(self.command, self.path, body=body or None, headers=headers)
            response = upstream.getresponse(); payload = response.read()
            self.send_response(response.status)
            for key,value in response.getheaders():
                if key.lower() not in ('connection','transfer-encoding','content-length','access-control-allow-origin','vary'):
                    self.send_header(key,value)
            self.cors(); self.send_header('Content-Length', str(len(payload)))
            self.end_headers(); self.wfile.write(payload)
        except OSError:
            self.send_response(502); self.cors(); self.end_headers()
        finally:
            upstream.close()
    do_GET = do_POST = do_PUT = do_PATCH = do_DELETE = forward
    def log_message(self, *_):
        pass
ThreadingHTTPServer(('127.0.0.1', 8091), PreviewProxy).serve_forever()
