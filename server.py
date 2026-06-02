import http.server
import urllib.request
import urllib.parse
import sys
import ssl

class PulseFeedProxyHandler(http.server.SimpleHTTPRequestHandler):
    def do_HEAD(self):
        # Delegate to do_GET but do not return a body
        self.do_GET(write_body=False)

    def do_GET(self, write_body=True):
        parsed_url = urllib.parse.urlparse(self.path)
        
        if parsed_url.path == '/proxy':
            query_params = urllib.parse.parse_qs(parsed_url.query)
            target_url = query_params.get('url', [None])[0]
            
            if not target_url:
                self.send_response(400)
                self.send_header('Content-Type', 'text/plain')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                if write_body:
                    self.wfile.write(b"Error: Missing 'url' query parameter.")
                return

            try:
                # Format request with browser User-Agent
                req = urllib.request.Request(
                    target_url,
                    headers={
                        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                    }
                )
                
                # Bypass SSL certificate checks for proxy (resolves macOS Python certificates issue and corporate SSL filters)
                ssl_context = ssl._create_unverified_context()
                
                # Fetch target RSS XML feed
                with urllib.request.urlopen(req, timeout=10, context=ssl_context) as response:
                    feed_data = response.read()
                    content_type = response.headers.get('Content-Type', 'text/xml; charset=utf-8')
                    
                    self.send_response(200)
                    self.send_header('Content-Type', content_type)
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    if write_body:
                        self.wfile.write(feed_data)
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'text/plain')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                if write_body:
                    self.wfile.write(f"Proxy fetch error: {str(e)}".encode('utf-8'))
        else:
            # Fallback to serving index.html, style.css, app.js
            if not write_body and parsed_url.path != '/proxy':
                super().do_HEAD()
            else:
                super().do_GET()

if __name__ == '__main__':
    port = 8000
    if len(sys.argv) > 1:
        port = int(sys.argv[1])
        
    server_address = ('', port)
    # Enable socket re-use to avoid port-in-use errors when restarting quickly
    class ReuseHTTPServer(http.server.HTTPServer):
        allow_reuse_address = True

    httpd = ReuseHTTPServer(server_address, PulseFeedProxyHandler)
    print(f"PulseFeed Server running at http://localhost:{port} with built-in CORS RSS Proxy...")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server.")
        httpd.server_close()
