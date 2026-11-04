from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from pathlib import Path
import time
release = Path('/tmp/rescue-loading-release')
class Proxy(BaseHTTPRequestHandler):
 def do_OPTIONS(self): self.forward()
 def do_GET(self): self.forward()
 def do_POST(self): self.forward()
 def forward(self):
  if self.path.startswith('/api/dashboard'):
   started=time.monotonic()
   while not release.exists() and time.monotonic()-started<45: time.sleep(.1)
  body=self.rfile.read(int(self.headers.get('Content-Length',0))) or None
  headers={k:v for k,v in self.headers.items() if k.lower() not in ('host','content-length')}
  try: response=urlopen(Request('http://127.0.0.1:8089'+self.path,data=body,headers=headers,method=self.command))
  except HTTPError as e: response=e
  self.send_response(response.status)
  for key,value in response.headers.items():
   if key.lower() not in ('transfer-encoding','connection','content-length'): self.send_header(key,value)
  self.end_headers()
  try:self.wfile.write(response.read())
  except BrokenPipeError:pass
 def log_message(self,*args):pass
ThreadingHTTPServer(('127.0.0.1',8088),Proxy).serve_forever()
