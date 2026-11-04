from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from pathlib import Path
import time
flag=Path('/tmp/rescue-history-read-mode')
class Proxy(BaseHTTPRequestHandler):
 def do_OPTIONS(self): self.forward()
 def do_GET(self): self.forward()
 def do_POST(self): self.forward()
 def forward(self):
  mode=flag.read_text().strip() if flag.exists() else 'ready'
  history=self.command=='GET' and self.path.startswith('/api/foods/') and ('storage-events' in self.path or '/product-info/events' in self.path or '/product-provenance/events' in self.path)
  if history and mode=='fail':
   self.send_response(503);self.send_header('Access-Control-Allow-Origin','http://127.0.0.1:4212');self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(b'{"detail":"temporary read failure"}');return
  if history and mode=='delay': time.sleep(3)
  body=self.rfile.read(int(self.headers.get('Content-Length',0))) or None
  headers={k:v for k,v in self.headers.items() if k.lower() not in ('host','content-length')}
  try:response=urlopen(Request('http://127.0.0.1:8087'+self.path,data=body,headers=headers,method=self.command))
  except HTTPError as e:response=e
  self.send_response(response.status)
  for k,v in response.headers.items():
   if k.lower() not in ('transfer-encoding','connection','content-length'):self.send_header(k,v)
  self.end_headers();self.wfile.write(response.read())
 def log_message(self,*args):pass
ThreadingHTTPServer(('127.0.0.1',8089),Proxy).serve_forever()
