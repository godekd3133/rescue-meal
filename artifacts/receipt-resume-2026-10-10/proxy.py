import json,time
from http.server import ThreadingHTTPServer,BaseHTTPRequestHandler
from urllib.request import Request,urlopen
from urllib.error import HTTPError
from pathlib import Path
class Proxy(BaseHTTPRequestHandler):
 def do_OPTIONS(self):self.forward()
 def do_GET(self):self.forward()
 def do_POST(self):self.forward()
 def do_PATCH(self):self.forward()
 def forward(self):
  if self.command=='GET' and self.path.startswith('/api/receipts/receipt-') and self.path.count('/')==3 and Path('/tmp/rescue-receipt-resume-missing').exists():
   self.send_response(404);self.send_header('Access-Control-Allow-Origin','http://127.0.0.1:4212');self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(b'{"detail":"synthetic missing draft"}');return
  if self.command=='POST' and self.path=='/api/shopping-list/manual' and Path('/tmp/rescue-shopping-manual-delay').exists():time.sleep(5)
  if self.command=='GET' and self.path.startswith('/api/receipts/receipt-') and Path('/tmp/rescue-receipt-resume-fail').exists():
   self.send_response(503);self.send_header('Access-Control-Allow-Origin','http://127.0.0.1:4212');self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(b'{"detail":"test draft read unavailable"}');return
  if self.command=='PATCH' and self.path.startswith('/api/recipe-review/drafts/') and Path('/tmp/rescue-recipe-save-delay').exists():time.sleep(3)
  if self.command=='PATCH' and self.path.startswith('/api/recipe-review/drafts/') and Path('/tmp/rescue-recipe-save-fail').exists():
   self.send_response(503);self.send_header('Access-Control-Allow-Origin','http://127.0.0.1:4212');self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(b'{"detail":{"code":"recipe_review_persistence_unavailable","message":"synthetic recipe save rejection"}}');return
  if self.command=='PATCH' and self.path.endswith('/product-info') and Path('/tmp/rescue-product-save-fail').exists():
   self.send_response(503);self.send_header('Access-Control-Allow-Origin','http://127.0.0.1:4212');self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(b'{"detail":{"code":"product_info_persistence_unavailable","message":"synthetic persistence rejection"}}');return
  if self.command=='POST' and (self.path.endswith('/storage-events') or self.path.endswith('/storage-event-sequence')):
   path=Path('/tmp/rescue-storage-request-keys.json');keys=json.loads(path.read_text()) if path.exists() else [];keys.append(self.headers.get('Idempotency-Key'));path.write_text(json.dumps(keys))
   if Path('/tmp/rescue-storage-save-delay').exists():time.sleep(2)
   if Path('/tmp/rescue-storage-save-fail').exists():
    code='storage_event_sequence_persistence_unavailable' if self.path.endswith('/storage-event-sequence') else 'storage_event_persistence_unavailable'
    self.send_response(503);self.send_header('Access-Control-Allow-Origin','http://127.0.0.1:4212');self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(json.dumps({'detail':{'code':code,'message':'synthetic storage rejection'}}).encode());return
  body=self.rfile.read(int(self.headers.get('Content-Length',0))) or None;headers={k:v for k,v in self.headers.items() if k.lower() not in ('host','content-length')}
  try:r=urlopen(Request('http://127.0.0.1:8087'+self.path,data=body,headers=headers,method=self.command))
  except HTTPError as e:r=e
  payload=r.read()
  if r.status==200 and self.command=='GET' and self.path.startswith('/api/receipts/receipt-') and self.path.count('/')==3 and Path('/tmp/rescue-receipt-resume-saved').exists():
   draft=json.loads(payload);draft['stock_created']=True;draft['status']='committed';payload=json.dumps(draft).encode()
  if r.status==200 and self.command=='POST' and self.path=='/api/shopping-list/manual' and Path('/tmp/rescue-shopping-manual-ack-drop').exists():
   self.send_response(503);self.send_header('Access-Control-Allow-Origin','http://127.0.0.1:4212');self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(b'{"detail":"synthetic acknowledgement unavailable"}');return
  if r.status==200 and self.command=='POST' and self.path.endswith('/storage-event-sequence') and Path('/tmp/rescue-storage-ack-drop').exists():
   self.send_response(503);self.send_header('Access-Control-Allow-Origin','http://127.0.0.1:4212');self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(b'{"detail":"synthetic acknowledgement unavailable"}');return
  self.send_response(r.status)
  for k,v in r.headers.items():
   if k.lower() not in ('transfer-encoding','connection','content-length'):self.send_header(k,v)
  self.end_headers();self.wfile.write(payload)
 def log_message(self,*args):pass
ThreadingHTTPServer(('127.0.0.1',8089),Proxy).serve_forever()
