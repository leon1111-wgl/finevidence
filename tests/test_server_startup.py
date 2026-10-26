"""The numeric-loopback workbench must not require a working DNS resolver."""
import http.client
import json
import socket
import threading
import unittest
from unittest.mock import patch

from finevidence.server import make_server


class LoopbackStartupTests(unittest.TestCase):
    def test_unavailable_name_service_still_allows_source_checked_calculation(self):
        # An audit hook / sandbox can refuse name-service access entirely. Keep
        # the real bind, workspace, HTTP request and financial calculation.
        with patch('socket.gethostbyaddr', side_effect=RuntimeError('resolver unavailable')):
            server = make_server(port=0)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                host, port = server.server_address
                self.assertEqual(host, '127.0.0.1')
                self.assertEqual(server.server_name, '127.0.0.1')
                self.assertEqual(server.server_port, port)
                connection = http.client.HTTPConnection(host, port, timeout=3)
                try:
                    connection.request('GET', '/api/session')
                    response = connection.getresponse()
                    self.assertEqual(response.status, 200)
                    session = json.loads(response.read())
                    connection.request('POST', '/api/run', json.dumps({
                        'operation': 'revenue-growth', 'company': 'Aurora Orchard',
                        'year': 2024, 'query': '',
                    }), {'Content-Type': 'application/json',
                         'X-FinEvidence-CSRF': session['csrf']})
                    response = connection.getresponse()
                    result = json.loads(response.read())
                    self.assertEqual(response.status, 200)
                    self.assertEqual(result['calculations'][0]['display'], '20.00%')
                    self.assertEqual({c['year'] for c in result['citations']}, {2023, 2024})
                    connection.request('GET', '/api/session', headers={'Host': 'evil.invalid'})
                    response = connection.getresponse()
                    self.assertEqual(response.status, 403)
                    self.assertEqual(json.loads(response.read())['status'], 'ORIGIN_REJECTED')
                finally:
                    connection.close()
            finally:
                server.shutdown()
                server.server_close()
                server.workspace.close()
                thread.join(3)

    def test_busy_loopback_port_is_not_rebound_elsewhere(self):
        with socket.socket() as occupied:
            occupied.bind(('127.0.0.1', 0))
            occupied.listen()
            with self.assertRaises(OSError):
                make_server(port=occupied.getsockname()[1])

    def test_workspace_failure_releases_bound_port(self):
        with socket.socket() as reserve:
            reserve.bind(('127.0.0.1', 0))
            port = reserve.getsockname()[1]
        with patch('finevidence.server.Workspace', side_effect=ValueError('SOURCE_ERROR')):
            with self.assertRaisesRegex(ValueError, 'SOURCE_ERROR'):
                make_server(port=port)
        with socket.socket() as replacement:
            replacement.bind(('127.0.0.1', port))
