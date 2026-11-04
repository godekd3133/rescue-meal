from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from pathlib import Path
class Proxy(BaseHTTPRequestHandler):
 def do_OPTIONS(self):self.forward()
 def do_GET(self):self.forward()
 def do_POST(self):self.forward()
 def forward(self):
  if self.path=='/api/auth/login' and self.command=='POST':
   self.rfile.read(int(self.headers.get('Content-Length',0)))
   self.send_response(503);self.send_header('Access-Control-Allow-Origin','http://127.0.0.1:4207');self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(b'{"detail":"test unavailable"}');return
  body=self.rfile.read(int(self.headers.get('Content-Length',0))) or None
  headers={k:v for k,v in self.headers.items() if k.lower() not in ('host','content-length')}
  try:response=urlopen(Request('http://127.0.0.1:8089'+self.path,data=body,headers=headers,method=self.command))
  except HTTPError as e:response=e
  self.send_response(response.status)
  for k,v in response.headers.items():
   if k.lower() not in ('transfer-encoding','connection','content-length'):self.send_header(k,v)
  self.end_headers();self.wfile.write(response.read())
 def log_message(self,*args):pass
ThreadingHTTPServer(('127.0.0.1',8088),Proxy).serve_forever()
