import unittest
from unittest.mock import patch
import main

class BotTests(unittest.TestCase):
    @patch.object(main, 'telegram')
    @patch.object(main, 'backend')
    def test_purchase(self, backend, telegram):
        backend.return_value = {'id': 7, 'total': 500}
        main.handle({'callback_query': {'id': 'q1', 'from': {'id': 123}, 'data': 'buy:1', 'message': {'message_id': 10, 'chat': {'id': 123}}}})
        backend.assert_called_once_with('/api/orders', {'user_id': 123, 'product_id': 1, 'quantity': 1})
        self.assertEqual(telegram.call_args.kwargs['text'], 'Order #7 confirmed! Total: €5.00')

    @patch.object(main, 'sticker')
    @patch.object(main, 'telegram')
    @patch.object(main, 'WEB_APP', 'https://example.com')
    def test_start(self, telegram, sticker):
        main.handle({'message': {'text': '/start', 'chat': {'id': 123, 'type': 'private'}}})
        sticker.assert_called_once_with(123)
        keyboard = telegram.call_args.kwargs['reply_markup']['inline_keyboard']
        self.assertEqual(keyboard[-1][0]['web_app']['url'], 'https://example.com')

if __name__ == '__main__':
    unittest.main()
