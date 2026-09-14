#!/usr/bin/env python3
"""Check the nginx response contract against a running self-hosted instance."""
import sys,time,urllib.request,urllib.error
base=sys.argv[1].rstrip('/')
expected={'X-Content-Type-Options':'nosniff','X-Frame-Options':'SAMEORIGIN','Referrer-Policy':'no-referrer','Permissions-Policy':'camera=(), microphone=(), geolocation=()'}
for attempt in range(20):
    try:
        urllib.request.urlopen(base,timeout=2).close()
        break
    except (OSError,urllib.error.URLError):
        if attempt==19: raise
        time.sleep(.25)
for path in ['/', '/index.html', '/selfhost-branding.json']:
    try: response=urllib.request.urlopen(base+path,timeout=5)
    except urllib.error.HTTPError as error: response=error
    with response:
        for key,value in expected.items():
            actual=response.headers.get(key)
            assert actual==value, f'{path}: {key} expected {value!r}, got {actual!r}'
    print(f'Headers OK: {path}')
