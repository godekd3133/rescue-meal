from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
import urllib.request, urllib.error, json, socket
MODE=Path('/tmp/rescue-meal-receipt-proxy-mode')
LOG=Path('/tmp/rescue-meal-receipt-proxy-log.jsonl')
class Proxy(BaseHTTPRequestHandler):
 def log_message(self,*args): pass
 def handle_request(self):
  body=self.rfile.read(int(self.headers.get('Content-Length','0')))
  commit=self.command=='POST' and self.path.endswith('/commit')
  mode=MODE.read_text().strip() if MODE.exists() else 'pass'
  if commit:
   with LOG.open('a') as f: f.write(json.dumps({'path':self.path,'key':self.headers.get('Idempotency-Key'),'mode':mode})+'\n')
  if commit and mode=='reject':
   self.send_response(503);self.send_header('Content-Type','application/json');self.send_header('Access-Control-Allow-Origin','http://127.0.0.1:4196');self.end_headers();self.wfile.write(json.dumps({'detail':{'code':'receipt_commit_persistence_unavailable','message':'test rejection'}}).encode());return
  headers={k:v for k,v in self.headers.items() if k.lower() not in ('host','connection','content-length')}
  req=urllib.request.Request('http://127.0.0.1:8019'+self.path,data=body if body else None,headers=headers,method=self.command)
  try: response=urllib.request.urlopen(req,timeout=30)
  except urllib.error.HTTPError as e: response=e
  data=response.read()
  if commit and mode=='lost':
   self.connection.shutdown(socket.SHUT_RDWR);self.connection.close();return
  self.send_response(response.status)
  for k,v in response.headers.items():
   if k.lower() not in ('transfer-encoding','connection','content-length'):self.send_header(k,v)
  self.end_headers();self.wfile.write(data)
 do_GET=handle_request
 do_POST=handle_request
 do_PATCH=handle_request
 do_DELETE=handle_request
 do_OPTIONS=handle_request
ThreadingHTTPServer(('127.0.0.1',8020),Proxy).serve_forever()
