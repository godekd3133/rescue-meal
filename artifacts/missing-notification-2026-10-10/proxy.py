from http.server import ThreadingHTTPServer,BaseHTTPRequestHandler
from urllib.request import Request,urlopen
from urllib.error import HTTPError
from datetime import datetime,timezone
import json
notification={'id':'qa-missing-alert','kind':'date_check','severity':'attention','title':'포장지 날짜를 확인해 주세요','message':'','canonical_name':'확인할 식품','food_id':'qa-not-in-inventory','due_date':None,'source':'unknown_date','action':'food','read_at':None,'created_at':datetime.now(timezone.utc).isoformat()}
class Proxy(BaseHTTPRequestHandler):
 def do_OPTIONS(self):self.forward()
 def do_GET(self):self.forward()
 def do_POST(self):self.forward()
 def respond(self,data):
  self.send_response(200);self.send_header('Access-Control-Allow-Origin','http://127.0.0.1:4212');self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(json.dumps(data).encode())
 def forward(self):
  if self.command=='GET' and self.path.startswith('/api/notifications?'):self.respond([notification]);return
  if self.command=='POST' and self.path=='/api/notifications/qa-missing-alert/read':
   self.rfile.read(int(self.headers.get('Content-Length',0)));notification['read_at']=datetime.now(timezone.utc).isoformat();self.respond(notification);return
  body=self.rfile.read(int(self.headers.get('Content-Length',0))) or None;headers={k:v for k,v in self.headers.items() if k.lower() not in ('host','content-length')}
  try:r=urlopen(Request('http://127.0.0.1:8087'+self.path,data=body,headers=headers,method=self.command))
  except HTTPError as e:r=e
  self.send_response(r.status)
  for k,v in r.headers.items():
   if k.lower() not in ('transfer-encoding','connection','content-length'):self.send_header(k,v)
  self.end_headers();self.wfile.write(r.read())
 def log_message(self,*args):pass
ThreadingHTTPServer(('127.0.0.1',8089),Proxy).serve_forever()
