"""Small real loopback TLS peer for offline transport fault tests; no model."""
from contextlib import contextmanager
import json
import os
from pathlib import Path
import socket
import socketserver
import ssl
import subprocess
import tempfile
import threading
from unittest.mock import patch

RESPONSE = json.dumps({'model': 'SYNTHETIC_TLS_FIXTURE', 'choices': [
    {'finish_reason': 'stop', 'message': {'content': '{"tool":"finish","arguments":{}}'}}],
    'usage': {'total_tokens': 0}}).encode()

class TLSPeer:
    def __init__(self):
        self.directory = tempfile.TemporaryDirectory(prefix='finevidence-test-tls-')
        root = Path(self.directory.name)
        config = root / 'openssl.cnf'
        config.write_text('[req]\ndistinguished_name=dn\nx509_extensions=ext\nprompt=no\n'
                          '[dn]\nCN=localhost\n[ext]\nsubjectAltName=IP:127.0.0.1\n'
                          'basicConstraints=critical,CA:TRUE\nkeyUsage=digitalSignature,keyEncipherment,keyCertSign\n')
        self.cert = root / 'cert.pem'
        subprocess.run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
                        '-keyout', str(root/'key.pem'), '-out', str(self.cert), '-config', str(config)],
                       check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        self.context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        self.context.load_cert_chain(self.cert, root/'key.pem')
        self.mode = 'fast'; self.duration = 0; self.status = 200; self.body = RESPONSE
        self.chunk_count = 6
        self.plan = []
        self.requests = []; self.accepted = 0; self.closed = threading.Event(); self.stop = threading.Event()
        peer = self
        class Handler(socketserver.BaseRequestHandler):
            def handle(self):
                peer.accepted += 1
                self.request.settimeout(60)
                if peer.mode == 'tls-stall':
                    # Read ClientHello, then wait for EOF without completing TLS.
                    while not peer.stop.is_set():
                        if not self.request.recv(65536): peer.closed.set(); return
                    return
                try:
                    with peer.context.wrap_socket(self.request, server_side=True) as conn:
                        with conn.makefile('rb') as stream:
                            line = stream.readline(65537)
                            headers = {}
                            while line not in (b'\r\n', b'\n', b''):
                                if b':' in line:
                                    k, v = line.split(b':', 1); headers[k.lower()] = v.strip()
                                line = stream.readline(65537)
                            body = stream.read(int(headers.get(b'content-length', b'0')))
                        peer.requests.append(json.loads(body))
                        mode, duration, response = (peer.plan[len(peer.requests)-1] if peer.plan
                                                   else (peer.mode, peer.duration, peer.body))
                        head = (f'HTTP/1.1 {peer.status} Fixture\r\nContent-Length: {len(response)}\r\n'
                                f'Content-Type: application/json\r\nLocation: https://127.0.0.1:{peer.server.server_address[1]}/sink\r\n\r\n').encode()
                        if mode == 'header-trickle':
                            peer.write_chunks(conn, head, duration)
                            conn.sendall(response)
                        else:
                            conn.sendall(head)
                            if mode == 'silent':
                                if not conn.recv(1): peer.closed.set()
                                return
                            if mode == 'body-trickle': peer.write_chunks(conn, response, duration)
                            else: conn.sendall(response)
                except (OSError, ssl.SSLError):
                    peer.closed.set()
        class Server(socketserver.ThreadingTCPServer):
            daemon_threads = True
            allow_reuse_address = True
        self.server = Server(('127.0.0.1', 0), Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def write_chunks(self, conn, data, duration):
        parts = self.chunk_count
        for i in range(parts):
            if i and self.stop.wait(duration/(parts-1)): return
            conn.sendall(data[len(data)*i//parts:len(data)*(i+1)//parts])

    @contextmanager
    def environment(self):
        with patch.dict(os.environ, {'FINEVIDENCE_API_KEY': 'SYNTHETIC_LOCAL_ONLY',
                'FINEVIDENCE_API_BASE': f'https://127.0.0.1:{self.server.server_address[1]}/v1',
                'FINEVIDENCE_MODEL': 'synthetic-deadline-fixture',
                'SSL_CERT_FILE': str(self.cert), 'NO_PROXY': '127.0.0.1', 'no_proxy': '127.0.0.1'}):
            yield

    def close(self):
        self.stop.set(); self.server.shutdown(); self.server.server_close(); self.thread.join()
        self.directory.cleanup()
