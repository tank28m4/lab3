"""Telegram long-polling bot; Python standard library only."""
import io
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

TOKEN = os.environ.get('TELEGRAM_BOT_TOKEN', '')
BACKEND = os.environ.get('BACKEND_URL', 'http://127.0.0.1:3000').rstrip('/')
KEY = os.environ.get('BACKEND_API_KEY', '')
WEB_APP = os.environ.get('WEB_APP_URL', '')


def request(url, data=None, headers=None):
    req = urllib.request.Request(url, data=data, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=40) as response:
            return json.load(response)
    except urllib.error.HTTPError as exc:
        try:
            message = json.load(exc).get('error', 'Request failed')
        except (ValueError, AttributeError):
            message = 'Request failed'
        raise RuntimeError(message) from None


def telegram(method, **params):
    result = request(f'https://api.telegram.org/bot{TOKEN}/{method}',
                     json.dumps(params).encode(), {'Content-Type': 'application/json'})
    if not result.get('ok'):
        raise RuntimeError('Telegram request failed')
    return result['result']


def backend(path, data=None):
    return request(BACKEND + path, json.dumps(data).encode() if data is not None else None,
                   {'Content-Type': 'application/json', 'X-Api-Key': KEY})


def send(chat, text, buttons=None):
    params = {'chat_id': chat, 'text': text}
    if buttons:
        params['reply_markup'] = {'inline_keyboard': buttons}
    telegram('sendMessage', **params)


def sticker(chat):
    # Upload an original static WEBP sticker rather than relying on a third-party file ID.
    from pathlib import Path
    content = Path(__file__).with_name('welcome.webp').read_bytes()
    boundary = uuid.uuid4().hex
    body = (f'--{boundary}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n{chat}\r\n'
            f'--{boundary}\r\nContent-Disposition: form-data; name="sticker"; filename="welcome.webp"\r\n'
            'Content-Type: image/webp\r\n\r\n').encode() + content + f'\r\n--{boundary}--\r\n'.encode()
    result = request(f'https://api.telegram.org/bot{TOKEN}/sendSticker', body,
                    {'Content-Type': f'multipart/form-data; boundary={boundary}'})
    if not result.get('ok'):
        raise RuntimeError('Sticker upload failed')


def catalog(chat):
    products = backend('/api/products')
    buttons = [[{'text': f"{p['name']} · €{p['price']/100:.2f} ({p['stock']} left)",
                 'callback_data': f"choose:{p['id']}"}] for p in products if p['stock'] > 0]
    send(chat, 'Choose a product:', buttons)


def handle(update):
    if 'callback_query' in update:
        query = update['callback_query']
        telegram('answerCallbackQuery', callback_query_id=query['id'])
        chat = query.get('message', {}).get('chat', {}).get('id')
        if chat is None:
            return
        user = query['from']['id']
        data = query.get('data', '')
        if data == 'catalog':
            catalog(chat)
        elif data == 'orders':
            orders = backend('/api/orders?' + urllib.parse.urlencode({'user_id': user}))
            send(chat, '\n'.join(f"#{o['id']} · {o['quantity']} item(s) · €{o['total']/100:.2f}" for o in orders) or 'No orders yet.')
        elif data.startswith('choose:'):
            product = int(data.split(':')[1])
            send(chat, 'Confirm purchase of one item?', [[{'text': 'Confirm order', 'callback_data': f'buy:{product}'}, {'text': 'Cancel', 'callback_data': 'catalog'}]])
        elif data.startswith('buy:'):
            order = backend('/api/orders', {'user_id': user, 'product_id': int(data.split(':')[1]), 'quantity': 1})
            # Remove the confirmation keyboard to prevent ordinary double taps.
            telegram('editMessageReplyMarkup', chat_id=chat, message_id=query['message']['message_id'], reply_markup={'inline_keyboard': []})
            send(chat, f"Order #{order['id']} confirmed! Total: €{order['total']/100:.2f}")
    elif 'message' in update:
        message = update['message']
        chat = message['chat']['id']
        text = message.get('text', '').split('@')[0]
        if text == '/catalog':
            catalog(chat)
        else:
            buttons = [[{'text': 'Catalog', 'callback_data': 'catalog'}, {'text': 'My orders', 'callback_data': 'orders'}]]
            if WEB_APP and message['chat']['type'] == 'private':
                buttons.append([{'text': 'Open Mini App', 'web_app': {'url': WEB_APP}}])
            send(chat, 'Welcome to Campus Shop! Browse products, confirm an order, and view your history.', buttons)
            if text == '/start':
                sticker(chat)


def main():
    if not TOKEN or not KEY:
        raise SystemExit('Set TELEGRAM_BOT_TOKEN and BACKEND_API_KEY before starting the bot.')
    if WEB_APP and not WEB_APP.startswith('https://'):
        raise SystemExit('WEB_APP_URL must use HTTPS.')
    backend('/health')
    telegram('getMe')
    telegram('deleteWebhook', drop_pending_updates=False)
    offset = 0
    while True:
        try:
            updates = telegram('getUpdates', offset=offset, timeout=25, allowed_updates=['message', 'callback_query'])
            for update in updates:
                try:
                    handle(update)
                except (RuntimeError, ValueError, KeyError, urllib.error.URLError):
                    chat = update.get('message', update.get('callback_query', {}).get('message', {})).get('chat', {}).get('id')
                    if chat:
                        send(chat, 'Unable to complete the request. Check stock and try again.')
                offset = update['update_id'] + 1
        except (RuntimeError, urllib.error.URLError):
            print('Connection error; retrying in 5 seconds.', flush=True)
            time.sleep(5)


if __name__ == '__main__':
    main()
