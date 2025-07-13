import http.server
import socketserver
import os
from urllib.parse import urlparse

class SPAHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        # Parse the URL
        url_parts = urlparse(self.path)
        path = url_parts.path
        
        # If it's a file request (has extension), serve normally
        if '.' in os.path.basename(path):
            return super().do_GET()
        
        # For SPA routes, always serve index.html
        if path.startswith('/login') or path.startswith('/dashboard') or path.startswith('/profile') or path.startswith('/candidates') or path.startswith('/analytics') or path.startswith('/admin'):
            self.path = '/index.html'
        elif path == '/':
            self.path = '/index.html'
            
        return super().do_GET()

if __name__ == "__main__":
    PORT = 3000
    
    # Change to the frontend directory
    os.chdir(r'D:\hrProject\smart-port\frontend')
    
    with socketserver.TCPServer(("", PORT), SPAHTTPRequestHandler) as httpd:
        print(f"SPA Server running at: http://localhost:{PORT}")
        print(f"Routes supported: /, /login, /dashboard, /profile, /candidates, /analytics, /admin")
        print(f"All routes will serve index.html for SPA routing")
        httpd.serve_forever()
