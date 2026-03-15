from flask import Flask, render_template, jsonify
from flask_socketio import SocketIO

from detector import Detector

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins='*', async_mode='threading')

detector = None


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/status')
def status():
    payload = {
        'ok': detector is not None,
        'status': detector.latest_status if detector else {},
    }
    resp = jsonify(payload)
    resp.headers['Access-Control-Allow-Origin'] = '*'
    return resp


def background_emit():
    global detector
    while True:
        if detector and detector.latest_frame_b64:
            payload = {
                'image': 'data:image/jpeg;base64,' + detector.latest_frame_b64,
                'status': detector.latest_status
            }
            socketio.emit('frame', payload)
        socketio.sleep(0.03)


if __name__ == '__main__':
    detector = Detector()
    detector.start()
    socketio.start_background_task(target=background_emit)
    socketio.run(app, host='0.0.0.0', port=5000)
