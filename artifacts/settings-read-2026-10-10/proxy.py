from http.server import ThreadingHTTPServer,BaseHTTPRequestHandler
from urllib.request import Request,urlopen
from urllib.error import HTTPError
from pathlib import Path
class Proxy(BaseHTTPRequestHandler):
 def do_OPTIONS(self):self.forward()
 def do_GET(self):self.forward()
 def do_POST(self):self.forward()
 def do_PUT(self):self.forward()
 def forward(self):
  if self.command=='PUT' and self.path=='/api/notification-preferences' and Path('/tmp/rescue-settings-save-fail').exists():
   self.rfile.read(int(self.headers.get('Content-Length',0)))
   self.send_response(503);self.send_header('Access-Control-Allow-Origin','http://127.0.0.1:4212');self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(b'{"detail":"test settings save unavailable"}');return
  if self.command=='GET' and self.path=='/api/notification-preferences' and Path('/tmp/rescue-settings-read-fail').exists():
   self.send_response(503);self.send_header('Access-Control-Allow-Origin','http://127.0.0.1:4212');self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(b'{"detail":"test preference read unavailable"}');return
  body=self.rfile.read(int(self.headers.get('Content-Length',0))) or None;headers={k:v for k,v in self.headers.items() if k.lower() not in ('host','content-length')}
  try:r=urlopen(Request('http://127.0.0.1:8087'+self.path,data=body,headers=headers,method=self.command))
  except HTTPError as e:r=e
  self.send_response(r.status)
  for k,v in r.headers.items():
   if k.lower() not in ('transfer-encoding','connection','content-length'):self.send_header(k,v)
  self.end_headers();self.wfile.write(r.read())
 def log_message(self,*args):pass
ThreadingHTTPServer(('127.0.0.1',8089),Proxy).serve_forever()
