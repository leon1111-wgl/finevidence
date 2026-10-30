"""Observe actual release, not client receipt, in the concurrent-body regression."""
import threading
import unittest
from unittest.mock import patch

import test_request_body as body


class RequestSlotObservationTests(unittest.TestCase):
    def test_post_response_scheduling_delay_passes_but_missing_release_fails(self):
        for missing_release in (False, True):
            with self.subTest(missing_release=missing_release):
                class ControlledCase(body.RequestBodyTests):
                    def setUp(case):
                        super().setUp()
                        case.response_sent = threading.Event()
                        case.hold = threading.Event()
                        original_send = body.Handler._send
                        def send(handler, status, data, *args, **kwargs):
                            result = original_send(handler, status, data, *args, **kwargs)
                            if status == 200 and data.get('status') == 'CALCULATED':
                                case.response_sent.set()
                                # Inject a scheduler pause AFTER bytes reach the client.
                                case.hold.wait(.2)
                            return result
                        sending = patch.object(body.Handler, '_send', send)
                        sending.start(); case.addCleanup(sending.stop)
                        release = case.server.slots.release
                        def maybe_release(*args, **kwargs):
                            if missing_release and case.response_sent.is_set(): return
                            return release(*args, **kwargs)
                        releasing = patch.object(case.server.slots, 'release', side_effect=maybe_release)
                        releasing.start(); case.addCleanup(releasing.stop)
                case = ControlledCase('test_four_timeouts_release_all_slots_for_following_calculation')
                result = unittest.TestResult(); case.run(result)
                self.assertEqual(result.errors, [])
                self.assertTrue(case.response_sent.is_set(), 'actual successful response reached')
                if missing_release:
                    self.assertFalse(result.wasSuccessful(), 'a retained slot must still fail')
                else:
                    self.assertTrue(result.wasSuccessful(), result.failures)


if __name__ == '__main__': unittest.main()
