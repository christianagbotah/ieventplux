#!/usr/bin/env python3
"""Loopback-only synthetic catalogue for Android visual acceptance.
Not a production service. No real accounts, secrets, mutations or provider calls.
"""
import datetime as dt
import json
import struct
import zlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

BASE = "http://127.0.0.1:3137"
NOW = dt.datetime.now(dt.timezone.utc)
START = (NOW + dt.timedelta(days=14)).isoformat()
END = (NOW + dt.timedelta(days=14, hours=3)).isoformat()
ORG = {"id":"visual-org","name":"Visual QA Studio","slug":"visual-qa-studio"}
EVENT = {"id":"visual-event","slug":"visual-event","title":"City Culture Weekend",
         "summary":"An afternoon of music, art and community.","description":"Discover local creators, exhibitions and performances.",
         "coverImageUrl":BASE+"/fixtures/cover.png","startsAt":START,"endsAt":END,
         "city":"Accra","country":"GH","timezone":"Africa/Accra","mode":"PHYSICAL",
         "categorySlug":"culture","status":"PUBLISHED","visibility":"PUBLIC","org":ORG,
         "ticketTypes":[{"id":"visual-pass","eventId":"visual-event","name":"General admission",
                         "description":"Entry to the afternoon programme.","kind":"STANDARD",
                         "priceMinor":5000,"currency":"GHS","quota":100,"soldCount":15,"reservedCount":0,
                         "perBuyerLimit":5,"includesVirtualAccess":False,"active":True,"sortOrder":0}],
         "venue":{"id":"visual-venue","name":"Community Arts Centre","city":"Accra","address":"Synthetic fixture venue"},
         "agenda":[],"contributors":[],"programmes":[],"souvenirs":[],"updates":[],"gallery":[]}
HOME = {"featured":[EVENT],"upcoming":[EVENT],"liveNow":[],"categories":[{"id":"culture","slug":"culture","name":"Culture"}],
        "sponsored":[],"stats":{"upcomingEvents":1,"organizers":1,"liveNow":0}}
DETAIL = {"event":EVENT,"stats":{"followers":4,"going":15,"comments":0},
          "mine":{"saved":False,"going":False,"following":False},"canManage":False}

def png():
    """Deterministic geometric sample poster, no external imagery."""
    w,h=640,360
    rows=[]
    for y in range(h):
        row=bytearray([0])
        for x in range(w):
            if (x-460)**2+(y-90)**2<85**2:
                rgb=(232,184,100)
            elif y>220 and x>140+(y-220)//2 and x<520:
                rgb=(29,113,110)
            else:
                rgb=(15+x*24//w,58+y*36//h,70+x*30//w)
            row.extend(rgb)
        rows.append(bytes(row))
    def chunk(kind,data):
        return struct.pack(">I",len(data))+kind+data+struct.pack(">I",zlib.crc32(kind+data)&0xffffffff)
    return b"\x89PNG\r\n\x1a\n"+chunk(b"IHDR",struct.pack(">IIBBBBB",w,h,8,2,0,0,0))+chunk(b"IDAT",zlib.compress(b"".join(rows)))+chunk(b"IEND",b"")

POSTER=png()

class Fixture(BaseHTTPRequestHandler):
    def do_GET(self):
        route=urlsplit(self.path).path
        routes={
            "/api/v1/auth/me":{"user":None,"memberships":[]},
            "/api/v1/discovery/home":HOME,
            "/api/v1/discovery/locations":{"countries":[{"code":"GH","count":1}]},
            "/api/v1/events":{"items":[EVENT],"total":1,"page":1,"pageSize":12},
            "/api/v1/events/visual-event":DETAIL,
            "/api/v1/health":{"status":"fixture-only"}
        }
        if route=="/fixtures/cover.png":
            data=POSTER
            self.send_response(200)
            self.send_header("Content-Type","image/png")
        elif route in routes:
            data=json.dumps(routes[route]).encode()
            self.send_response(200)
            self.send_header("Content-Type","application/json")
        else:
            self.send_error(404)
            return
        self.send_header("Content-Length",str(len(data)))
        self.send_header("Cache-Control","no-store")
        self.end_headers()
        self.wfile.write(data)
    def do_POST(self):
        self.send_error(405,"Read-only visual fixture")
    do_PATCH=do_POST
    do_DELETE=do_POST

if __name__=="__main__":
    ThreadingHTTPServer(("127.0.0.1",3137),Fixture).serve_forever()
