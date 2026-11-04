from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
import urllib.request, urllib.error, json
class Proxy(BaseHTTPRequestHandler):
 def log_message(self,*args): pass
 def run_request(self):
  data=self.rfile.read(int(self.headers.get('Content-Length','0')))
  mode=Path('/tmp/rescue-notification-mode').read_text().strip() if Path('/tmp/rescue-notification-mode').exists() else 'pass'
  if self.command=='GET' and self.path.startswith('/api/notifications?') and mode=='fail':
   self.send_response(503);self.send_header('Content-Type','application/json');self.send_header('Access-Control-Allow-Origin','http://127.0.0.1:4202');self.end_headers();self.wfile.write(json.dumps({'detail':'test read unavailable'}).encode());return
  req=urllib.request.Request('http://127.0.0.1:8089'+self.path,data=data if data else None,headers={k:v for k,v in self.headers.items() if k.lower() not in ('host','connection','content-length')},method=self.command)
  try: response=urllib.request.urlopen(req,timeout=20)
  except urllib.error.HTTPError as e: response=e
  body=response.read();self.send_response(response.status)
  for k,v in response.headers.items():
   if k.lower() not in ('connection','transfer-encoding','content-length'):self.send_header(k,v)
  self.end_headers();self.wfile.write(body)
 do_GET=run_request
 do_POST=run_request
 do_OPTIONS=run_request
 do_PATCH=run_request
 do_DELETE=run_request
ThreadingHTTPServer(('127.0.0.1',8088),Proxy).serve_forever()
